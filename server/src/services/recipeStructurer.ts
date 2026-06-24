import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { generateStructured } from './ai/generateStructured';

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
  // Whether the source is actually a cooking recipe. Native structured output
  // forces this object shape, so a separate "not a recipe" payload is no longer
  // possible — the model signals it here instead.
  isRecipe: z.boolean(),
  notRecipeReason: z.string().nullable().default(null),
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

export type RecipeOutput = z.infer<typeof RecipeOutputSchema>;

export interface TextSources {
  caption: string;
  subtitle: string;
  transcript: string;
  ocrText: string;
  videoTitle: string;
  videoDescription: string;
}

const SYSTEM_PROMPT = `You are a recipe extraction AI. You receive raw text extracted from a cooking video through multiple sources (captions, audio transcription, on-screen text, video description). Extract and structure the recipe into the provided schema.

Rules:
- Set isRecipe to false (with a short notRecipeReason) if the content is not a cooking recipe; otherwise set it true.
- Cross-reference ALL text sources. Prefer specifics (measurements, times) from whichever source is clearest.
- If ingredients are mentioned but quantities aren't specified, make a reasonable estimate and set confidence to "medium".
- Standardize measurements (e.g., "a cup" -> "1 cup"). Use common abbreviations.
- If a step says "season to taste", keep it. Don't invent quantities for subjective amounts.
- Categorize each ingredient (produce, dairy, protein, spices, pantry, other) for grocery shopping.
- Infer cuisine type and tags (e.g. "quick", "vegetarian", "one-pot") from context.
- sourceQuality reflects which inputs were actually useful for the extraction.`;

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
  const result = await generateStructured({
    schema: RecipeOutputSchema,
    schemaName: 'recipe',
    schemaDescription: 'A structured cooking recipe extracted from a video.',
    system: SYSTEM_PROMPT,
    user: buildUserMessage(sources),
  });

  if (!result.isRecipe) {
    throw Object.assign(
      new Error(result.notRecipeReason ?? "This video doesn't appear to contain a recipe."),
      { code: 'not_a_recipe' },
    );
  }

  return result;
}

/**
 * Adds server-side fields (id, timestamps) to a validated recipe output. Drops
 * the extraction-only flags (isRecipe / notRecipeReason).
 */
export function toRecipeRecord(
  output: RecipeOutput,
  sourceUrl: string,
  platform: string
) {
  const { isRecipe: _isRecipe, notRecipeReason: _notRecipeReason, ...recipe } = output;
  const now = new Date().toISOString();
  return {
    ...recipe,
    id: uuid(),
    sourceUrl,
    platform,
    createdAt: now,
    updatedAt: now,
    ingredients: recipe.ingredients.map((ing, i) => ({
      ...ing,
      id: uuid(),
      sortOrder: i,
    })),
  };
}
