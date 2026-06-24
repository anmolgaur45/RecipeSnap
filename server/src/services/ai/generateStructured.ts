import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getVertexAI } from './vertex';
import { anthropicClient } from '../aiClients';

// Single entry point for "give me JSON shaped like this zod schema". Replaces the
// old prompt-for-JSON-then-regex-parse pattern with native structured output:
//   - primary: Gemini 3.5 Flash on Vertex (responseJsonSchema constrains generation)
//   - fallback: Claude via forced tool use (input_schema constrains generation)
// Both paths are validated with the zod schema afterwards (defence in depth).

function geminiModel(): string {
  return process.env.GEMINI_STRUCTURER_MODEL ?? 'gemini-3.5-flash';
}

function claudeModel(): string {
  return process.env.CLAUDE_STRUCTURER_MODEL ?? 'claude-haiku-4-5-20251001';
}

export interface StructuredRequest<S extends z.ZodTypeAny> {
  /** zod schema used to validate (and default-fill) the model output. */
  schema: S;
  /** Tool name for the Claude fallback (snake/kebab, no spaces). */
  schemaName: string;
  /** One-line description of what the object represents (Claude tool description). */
  schemaDescription: string;
  /** System instruction / role prompt. */
  system: string;
  /** The user content (assembled text sources). */
  user: string;
  /** Output token ceiling. Default 8192. */
  maxOutputTokens?: number;
}

export async function generateStructured<S extends z.ZodTypeAny>(
  req: StructuredRequest<S>,
): Promise<z.infer<S>> {
  const jsonSchema = toModelSchema(req.schema);
  let lastError: unknown;

  // Primary: Gemini on Vertex with native structured output.
  try {
    return await withGemini(req, jsonSchema);
  } catch (err) {
    lastError = err;
    console.warn(`[ai] Gemini structuring failed (${req.schemaName}), trying Claude:`, err);
  }

  // Fallback: Claude via forced tool use (Anthropic-direct, nativeFetch egress fix).
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await withClaude(req, jsonSchema);
    } catch (err) {
      lastError = err;
      console.warn(`[ai] Claude structuring fallback failed (${req.schemaName}):`, err);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Structured generation failed: ${msg}`);
}

async function withGemini<S extends z.ZodTypeAny>(
  req: StructuredRequest<S>,
  jsonSchema: unknown,
): Promise<z.infer<S>> {
  const ai = getVertexAI();
  const res = await ai.models.generateContent({
    model: geminiModel(),
    contents: req.user,
    config: {
      systemInstruction: req.system,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
      temperature: 0.2,
      maxOutputTokens: req.maxOutputTokens ?? 8192,
    },
  });

  const text = res.text;
  if (!text || !text.trim()) {
    throw new Error('Gemini returned an empty response');
  }
  return req.schema.parse(JSON.parse(text)) as z.infer<S>;
}

async function withClaude<S extends z.ZodTypeAny>(
  req: StructuredRequest<S>,
  jsonSchema: unknown,
): Promise<z.infer<S>> {
  const anthropic = anthropicClient();
  const res = await anthropic.messages.create({
    model: claudeModel(),
    max_tokens: req.maxOutputTokens ?? 8192,
    system: req.system,
    tools: [
      {
        name: req.schemaName,
        description: req.schemaDescription,
        input_schema: jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: req.schemaName },
    messages: [{ role: 'user', content: req.user }],
  });

  const toolUse = res.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block');
  }
  return req.schema.parse(toolUse.input) as z.infer<S>;
}

/**
 * Converts a zod schema to a JSON schema both providers accept. Refs are inlined
 * (Gemini handles them poorly), union `type` arrays become `anyOf` (Gemini's
 * responseJsonSchema lists anyOf as supported but not multi-type arrays), and a
 * few noise keys are dropped.
 */
// zodToJsonSchema's generic over-instantiates on nested schemas (TS2589); a
// plain call signature sidesteps it without changing runtime behaviour.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options?: { $refStrategy?: string; target?: string },
) => unknown;

function toModelSchema(schema: z.ZodTypeAny): unknown {
  const raw = toJsonSchema(schema, { $refStrategy: 'none', target: 'jsonSchema7' });
  return normalize(raw);
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (node === null || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$schema' || key === 'default' || key === 'additionalProperties') continue;
    out[key] = normalize(value);
  }

  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    delete out.type;
    out.anyOf = types.map((t) => ({ type: t }));
  }

  return out;
}
