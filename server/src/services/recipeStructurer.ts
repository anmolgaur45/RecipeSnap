import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

// ── Zod schema for validating AI output ──────────────────────────────────────

const IngredientSchema = z.object({
  item: z.string(),
  quantity: z.string(),
  category: z.enum(['produce', 'dairy', 'protein', 'spices', 'pantry', 'other']),
  isOptional: z.boolean().default(false),
});

const StepSchema = z.object({
  stepNumber: z.number().int().positive(),
  instruction: z.string(),
  duration: z.string().nullable().default(null),
  tip: z.string().nullable().default(null),
});

const RecipeOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  servings: z.string().nullable().default(null),
  prepTime: z.string().nullable().default(null),
  cookTime: z.string().nullable().default(null),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  cuisine: z.string().nullable().default(null),
  ingredients: z.array(IngredientSchema),
  steps: z.array(StepSchema),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  confidence: z.enum(['high', 'medium', 'low']),
  sourceQuality: z.object({
    captionUseful: z.boolean(),
    transcriptUseful: z.boolean(),
    ocrUseful: z.boolean(),
  }),
});

const NotARecipeSchema = z.object({
  error: z.literal('not_a_recipe'),
  message: z.string(),
});

export type RecipeOutput = z.infer<typeof RecipeOutputSchema>;

export interface TextSources {
  caption: string;
  subtitle: string;
  transcript: string;
  ocrText: string;
  videoTitle: string;
  videoDescription: string;
}

const SYSTEM_PROMPT = `You are a recipe extraction AI. You receive raw text extracted from a cooking video through multiple sources (captions, audio transcription, on-screen text, video description). Your job is to extract and structure the recipe.

Return ONLY valid JSON matching this schema:
{
  "title": "string — recipe name",
  "description": "string — 1-2 sentence summary",
  "servings": "string — e.g. 'Serves 4' or null if unknown",
  "prepTime": "string — e.g. '15 mins' or null",
  "cookTime": "string — e.g. '30 mins' or null",
  "difficulty": "easy | medium | hard",
  "cuisine": "string — e.g. 'Italian', 'Indian', 'Mexican' or null",
  "ingredients": [
    {
      "item": "string — ingredient name",
      "quantity": "string — amount, e.g. '2 cups', '1 tbsp', 'to taste'",
      "category": "string — one of: produce, dairy, spices, protein, pantry, other",
      "isOptional": boolean
    }
  ],
  "steps": [
    {
      "stepNumber": number,
      "instruction": "string — clear, concise instruction",
      "duration": "string or null — e.g. '5 mins'",
      "tip": "string or null — any pro tip mentioned for this step"
    }
  ],
  "tags": ["string — relevant tags like 'quick', 'vegetarian', 'one-pot'"],
  "notes": "string or null — additional tips, substitutions, or storage instructions",
  "confidence": "high | medium | low — your confidence in extraction accuracy",
  "sourceQuality": {
    "captionUseful": boolean,
    "transcriptUseful": boolean,
    "ocrUseful": boolean
  }
}

Rules:
- Cross-reference ALL text sources. Prefer specifics (measurements, times) from whichever source is clearest.
- If ingredients are mentioned but quantities aren't specified, make a reasonable estimate and mark confidence as "medium".
- Standardize measurements (e.g., "a cup" → "1 cup"). Use common abbreviations.
- If a step says "season to taste", keep it — don't invent quantities for subjective amounts.
- Categorize ingredients for easy grocery shopping.
- Infer cuisine type and tags from context.
- If the content is NOT a recipe, return: { "error": "not_a_recipe", "message": "This video doesn't appear to contain a recipe." }`;

function buildUserMessage(sources: TextSources): string {
  const parts: string[] = [];

  if (sources.videoTitle) {
    parts.push(`VIDEO TITLE:\n${sources.videoTitle}`);
  }
  if (sources.videoDescription.trim()) {
    parts.push(`VIDEO DESCRIPTION / CAPTION:\n${sources.videoDescription}`);
  }
  if (sources.subtitle.trim()) {
    parts.push(`SUBTITLES:\n${sources.subtitle}`);
  }
  if (sources.transcript.trim()) {
    parts.push(`AUDIO TRANSCRIPT:\n${sources.transcript}`);
  }
  if (sources.ocrText.trim()) {
    parts.push(`ON-SCREEN TEXT (OCR):\n${sources.ocrText}`);
  }

  return parts.join('\n\n---\n\n') || 'No text sources available.';
}

export async function structureRecipe(sources: TextSources): Promise<RecipeOutput> {
  const userMessage = buildUserMessage(sources);

  // Try Claude first
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await structureWithClaude(userMessage);
    } catch (err) {
      console.warn('Claude structuring failed, trying Gemini fallback:', err);
    }
  }

  // Fallback: Gemini
  if (process.env.GOOGLE_GENERATIVE_AI_KEY) {
    try {
      return await structureWithGemini(userMessage);
    } catch (err) {
      console.warn('Gemini fallback also failed:', err);
    }
  }

  throw new Error('No AI providers available. Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_KEY.');
}

async function structureWithClaude(userMessage: string): Promise<RecipeOutput> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return parseAndValidate(text);
}

async function structureWithGemini(userMessage: string): Promise<RecipeOutput> {
  // Using the OpenAI-compatible Gemini API endpoint
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });

  const response = await client.chat.completions.create({
    model: 'gemini-1.5-flash',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 4096,
  });

  const text = response.choices[0]?.message?.content ?? '';
  return parseAndValidate(text);
}

function parseAndValidate(rawText: string): RecipeOutput {
  // Extract JSON from the response (handle markdown code blocks)
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ??
    rawText.match(/(\{[\s\S]+\})/);

  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[1]) as unknown;

  // Check for "not a recipe" response
  const notRecipeResult = NotARecipeSchema.safeParse(parsed);
  if (notRecipeResult.success) {
    throw Object.assign(new Error(notRecipeResult.data.message), {
      code: 'not_a_recipe',
    });
  }

  // Validate full recipe schema
  const recipeResult = RecipeOutputSchema.safeParse(parsed);
  if (!recipeResult.success) {
    throw new Error(`Invalid recipe schema: ${recipeResult.error.message}`);
  }

  return recipeResult.data;
}

/**
 * Adds server-side fields (id, timestamps) to a validated recipe output.
 */
export function toRecipeRecord(
  output: RecipeOutput,
  sourceUrl: string,
  platform: string
) {
  const now = new Date().toISOString();
  return {
    ...output,
    id: uuid(),
    sourceUrl,
    platform,
    createdAt: now,
    updatedAt: now,
    ingredients: output.ingredients.map((ing, i) => ({
      ...ing,
      id: uuid(),
      sortOrder: i,
    })),
  };
}
