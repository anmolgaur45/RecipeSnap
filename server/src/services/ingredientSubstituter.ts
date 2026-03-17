/**
 * Ingredient substitution service.
 * Given an ingredient + full recipe context, suggests 2-3 practical alternatives
 * using Claude Haiku. Results are cached in-memory (1 hour TTL) to avoid
 * duplicate API calls when the user re-opens the sheet.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { DbIngredient, DbRecipe, DbStep } from '../db/schema';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubstitutionSuggestion {
  replacement: string;
  quantity: string;
  quantityNote: string;
  flavorImpact: string;
  textureImpact: string;
  bestFor: string;
  notRecommendedFor: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SubstitutionResult {
  originalIngredient: string;
  substitutions: SubstitutionSuggestion[];
  recipeSpecificAdvice: string;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  result: SubstitutionResult;
  ts: number;
}

const substitutionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(recipeId: string, itemName: string, reason: string): string {
  return `${recipeId}:${itemName.toLowerCase()}:${reason}`;
}

function getCached(key: string): SubstitutionResult | null {
  const entry = substitutionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    substitutionCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: SubstitutionResult): void {
  substitutionCache.set(key, { result, ts: Date.now() });
}

// ── Zod schema ────────────────────────────────────────────────────────────────

const SubstitutionSuggestionSchema = z.object({
  replacement: z.string(),
  quantity: z.string(),
  quantityNote: z.string(),
  flavorImpact: z.string(),
  textureImpact: z.string(),
  bestFor: z.string(),
  notRecommendedFor: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

const SubstitutionResultSchema = z.object({
  originalIngredient: z.string(),
  substitutions: z.array(SubstitutionSuggestionSchema).min(1).max(3),
  recipeSpecificAdvice: z.string(),
});

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a culinary ingredient substitution expert. Given an ingredient that a user wants to replace and the full recipe context, suggest 2-3 practical alternatives.

Return ONLY valid JSON with no markdown, no code fences, no explanation:
{
  "originalIngredient": "heavy cream",
  "substitutions": [
    {
      "replacement": "coconut cream",
      "quantity": "1 cup",
      "quantityNote": "Same quantity as original",
      "flavorImpact": "Adds subtle coconut flavor; works well in curries and soups",
      "textureImpact": "Slightly thinner; will thicken similarly when reduced",
      "bestFor": "Dairy-free, vegan",
      "notRecommendedFor": "Delicate French sauces where coconut flavor would be distracting",
      "confidence": "high"
    }
  ],
  "recipeSpecificAdvice": "Since this recipe uses heavy cream in a pasta sauce, coconut cream or cashew cream will work well. Stir continuously over medium heat to prevent separation."
}

RULES:
- Consider the RECIPE CONTEXT carefully. A substitute that works in soup may not work in baking.
- Always provide the adjusted quantity (it may differ from the original).
- Be honest about flavor/texture impact — do not pretend substitutes are identical.
- Prioritize commonly available ingredients over exotic alternatives.
- For baking, consider structural role (binding, leavening, moisture).
- For the substitution reason: dietary = focus on diet compliance; unavailable = focus on pantry staples; allergy = prioritize safety and cross-contamination; budget = focus on cheaper everyday alternatives.`;

// ── Main function ─────────────────────────────────────────────────────────────

export async function substituteIngredient(params: {
  recipeId: string;
  recipe: DbRecipe;
  ingredient: DbIngredient;
  allIngredients: DbIngredient[];
  steps: DbStep[];
  reason: string;
}): Promise<SubstitutionResult> {
  const { recipeId, recipe, ingredient, allIngredients, steps, reason } = params;

  const key = cacheKey(recipeId, ingredient.item, reason);
  const cached = getCached(key);
  if (cached) {
    console.log(`[substituter] cache hit for "${ingredient.item}" (${reason})`);
    return cached;
  }

  console.log(`[substituter] calling AI for "${ingredient.item}" in "${recipe.title}" (reason: ${reason})`);

  const ingredientList = allIngredients
    .map((i, idx) => `${idx + 1}. ${i.quantity} ${i.item}`)
    .join('\n');

  const stepsContext = steps
    .slice(0, 3)
    .map((s) => `${s.stepNumber}. ${s.instruction}`)
    .join('\n');

  const userMessage = `Recipe: "${recipe.title}" (${recipe.servings ?? 'unknown servings'})

All ingredients:
${ingredientList}

Steps (first 3):
${stepsContext}

Ingredient to replace: "${ingredient.quantity} ${ingredient.item}"
Reason for substitution: ${reason}

Suggest 2-3 practical substitutes considering the full recipe context above.`;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText = response.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('');

  // Strip any accidental markdown code fences
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = SubstitutionResultSchema.parse(JSON.parse(cleaned));
  setCache(key, parsed);
  return parsed;
}
