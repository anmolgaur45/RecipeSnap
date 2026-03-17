/**
 * Recipe adapter service.
 * Sends an existing recipe + adaptation request to Claude (Gemini fallback)
 * and returns the adapted recipe content along with a diff of changes.
 *
 * The route handler is responsible for DB persistence — this module is pure.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ── Adaptation types ──────────────────────────────────────────────────────────

export type AdaptationType =
  | 'vegan'
  | 'vegetarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'keto'
  | 'halal'
  | 'nut-free'
  | 'custom';

export const ADAPTATION_LABELS: Record<AdaptationType, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-Free',
  'dairy-free': 'Dairy-Free',
  keto: 'Keto',
  halal: 'Halal',
  'nut-free': 'Nut-Free',
  custom: 'Custom',
};

const ADAPTATION_TYPES = Object.keys(ADAPTATION_LABELS) as AdaptationType[];

export function isAdaptationType(v: unknown): v is AdaptationType {
  return typeof v === 'string' && ADAPTATION_TYPES.includes(v as AdaptationType);
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

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

const AdaptationOutputSchema = z.object({
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
  // Adaptation-specific fields
  adaptationNotes: z.string(),
  changedIngredients: z.array(z.object({
    original: z.string(),
    replacement: z.string(),
    reason: z.string(),
  })),
  confidenceScore: z.enum(['high', 'medium', 'low']),
  flavorImpactNote: z.string().nullable().default(null),
  alreadyCompliant: z.boolean().default(false),
});

export type AdaptationOutput = z.infer<typeof AdaptationOutputSchema>;

// ── Prompt building ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a culinary AI that adapts recipes to meet dietary requirements. You receive an original recipe in JSON format and an adaptation request.

RULES:
- Modify ONLY what is necessary. Do not rewrite the entire recipe for a small change.
- For each substituted ingredient, include a brief reason (e.g., "coconut cream (replaces heavy cream for dairy-free)").
- Adjust cooking instructions ONLY if the substitution changes the technique (e.g., plant-based meat has different browning behaviour).
- Maintain the spirit and flavor profile of the original dish as closely as possible.
- If a substitution significantly changes the dish, set flavorImpactNote to a short description of expected differences.
- NEVER remove an ingredient without providing a substitute or explaining why it is omitted.
- If the recipe already complies with the request (no changes needed), set alreadyCompliant to true and return the original recipe unchanged with an empty changedIngredients array.

Return ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "title": "string",
  "description": "string",
  "servings": "string or null",
  "prepTime": "string or null",
  "cookTime": "string or null",
  "difficulty": "easy | medium | hard",
  "cuisine": "string or null",
  "ingredients": [
    { "item": "string", "quantity": "string", "category": "produce|dairy|protein|spices|pantry|other", "isOptional": boolean }
  ],
  "steps": [
    { "stepNumber": number, "instruction": "string", "duration": "string or null", "tip": "string or null" }
  ],
  "tags": ["string"],
  "notes": "string or null",
  "adaptationNotes": "string — brief summary of all changes made",
  "changedIngredients": [
    { "original": "string — original ingredient name + quantity", "replacement": "string — new ingredient name + quantity", "reason": "string — why this substitution works" }
  ],
  "confidenceScore": "high | medium | low",
  "flavorImpactNote": "string or null",
  "alreadyCompliant": boolean
}`;

const ADAPTATION_PROMPTS: Record<Exclude<AdaptationType, 'custom'>, string> = {
  vegan: 'Make this recipe fully vegan. Replace all animal products (meat, fish, dairy, eggs, honey) with plant-based alternatives.',
  vegetarian: 'Make this recipe vegetarian. Remove all meat and fish, but dairy and eggs may stay.',
  'gluten-free': 'Make this recipe gluten-free. Replace wheat flour, pasta, bread, regular soy sauce, and any other gluten-containing ingredients with certified gluten-free alternatives.',
  'dairy-free': 'Make this recipe dairy-free. Replace milk, butter, cream, yogurt, and cheese with non-dairy alternatives.',
  keto: 'Adapt this recipe for a ketogenic diet. Replace high-carb ingredients (rice, pasta, sugar, regular flour, potatoes) with low-carb alternatives (cauliflower rice, zucchini noodles, almond flour, erythritol, etc.).',
  halal: 'Make this recipe halal. Replace pork and pork-derived products with halal alternatives. Replace alcohol and alcohol-based ingredients with non-alcoholic substitutes (e.g., wine → grape juice + vinegar, beer → beef or chicken broth).',
  'nut-free': 'Make this recipe nut-free. Remove all tree nuts (almonds, cashews, walnuts, pecans, pine nuts, pistachios) and peanuts, replacing with safe alternatives (sunflower seeds, pumpkin seeds, nut-free butters, etc.).',
};

function buildAdaptationRequest(type: AdaptationType, customPrompt?: string): string {
  if (type === 'custom') {
    return customPrompt ?? 'Make the recipe healthier while keeping it delicious.';
  }
  return ADAPTATION_PROMPTS[type];
}

interface RecipeInput {
  title: string;
  description: string | null;
  servings: string | null;
  prepTime: string | null;
  cookTime: string | null;
  difficulty: string;
  cuisine: string | null;
  tags: string;    // JSON string from DB
  notes: string | null;
  ingredients: Array<{ item: string; quantity: string; category: string; isOptional: number }>;
  steps: Array<{ stepNumber: number; instruction: string; duration: string | null; tip: string | null }>;
}

function buildUserMessage(recipe: RecipeInput, type: AdaptationType, customPrompt?: string): string {
  const adaptationRequest = buildAdaptationRequest(type, customPrompt);

  const recipeJson = JSON.stringify({
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    difficulty: recipe.difficulty,
    cuisine: recipe.cuisine,
    tags: JSON.parse(recipe.tags || '[]') as string[],
    notes: recipe.notes,
    ingredients: recipe.ingredients.map((i) => ({
      item: i.item,
      quantity: i.quantity,
      category: i.category,
      isOptional: i.isOptional === 1,
    })),
    steps: recipe.steps,
  }, null, 2);

  return `ADAPTATION REQUEST: ${adaptationRequest}\n\nORIGINAL RECIPE:\n${recipeJson}`;
}

// ── AI calls ──────────────────────────────────────────────────────────────────

async function adaptWithClaude(userMessage: string): Promise<AdaptationOutput> {
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

async function adaptWithGemini(userMessage: string): Promise<AdaptationOutput> {
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

function parseAndValidate(rawText: string): AdaptationOutput {
  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ??
    rawText.match(/(\{[\s\S]+\})/);

  if (!jsonMatch) {
    throw new Error('No JSON found in AI adaptation response');
  }

  const parsed = JSON.parse(jsonMatch[1]) as unknown;
  const result = AdaptationOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid adaptation schema: ${result.error.message}`);
  }
  return result.data;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function adaptRecipe(
  recipe: RecipeInput,
  type: AdaptationType,
  customPrompt?: string,
): Promise<AdaptationOutput> {
  const userMessage = buildUserMessage(recipe, type, customPrompt);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await adaptWithClaude(userMessage);
    } catch (err) {
      console.warn('[recipeAdapter] Claude failed, trying Gemini:', err);
    }
  }

  if (process.env.GOOGLE_GENERATIVE_AI_KEY) {
    return adaptWithGemini(userMessage);
  }

  throw new Error('No AI providers available. Set ANTHROPIC_API_KEY or GOOGLE_GENERATIVE_AI_KEY.');
}
