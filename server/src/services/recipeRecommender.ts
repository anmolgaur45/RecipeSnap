import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { and, asc, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  recipes as recipesTable,
  ingredients as ingredientsTable,
  pantry as pantryTable,
  cookSessions,
  type DbPantryItem,
} from '../db/schema.pg';
import { normalizeItemName, computeExpiryStatus } from './pantryManager';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export type MatchCategory = 'ready' | 'almost' | 'needs_shopping';

export interface IngredientMatch {
  ingredient: string;
  matched: boolean;
  pantryItemId?: number;
  pantryItemName?: string;
  isExpiring?: boolean;
}

export interface RecipeRecommendation {
  recipeId: string;
  recipeTitle: string;
  recipeCuisine: string | null;
  recipeTime: string | null;
  recipeDifficulty: string;
  matchPercentage: number;
  score: number;
  category: MatchCategory;
  matchedIngredients: IngredientMatch[];
  missingIngredients: string[];
  usesExpiringItems: boolean;
  expiringIngredientNames: string[];
}

export interface AISuggestedRecipe {
  title: string;
  description: string;
  cuisine: string;
  cookTime: string;
  difficulty: string;
  ingredients: Array<{ item: string; quantity: string }>;
  steps: string[];
}

export interface ExpiringAlert {
  pantryItemId: number;
  pantryItemName: string;
  expiresAt: string | null;
  expiryStatus: 'expiring_soon' | 'expired';
  matchedRecipes: Array<{ recipeId: string; recipeTitle: string; matchPercentage: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKIP_INGREDIENTS = new Set(['water', 'ice', 'salt', 'pepper', 'oil', 'water water']);

function fuzzyMatch(ingNorm: string, pantryNorm: string): boolean {
  if (ingNorm === pantryNorm) return true;
  if (ingNorm.length >= 3 && pantryNorm.includes(ingNorm)) return true;
  if (pantryNorm.length >= 3 && ingNorm.includes(pantryNorm)) return true;
  return false;
}

// ── Pantry Matching ───────────────────────────────────────────────────────────

export async function getPantryMatches(
  userId: string,
  options: { limit?: number; minMatch?: number; prioritizeExpiring?: boolean } = {},
): Promise<RecipeRecommendation[]> {
  const { limit = 20, minMatch = 0, prioritizeExpiring = true } = options;

  const recipeRows = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.userId, userId))
    .orderBy(desc(recipesTable.createdAt));
  if (recipeRows.length === 0) return [];

  const pantryItems = await db.select().from(pantryTable).where(eq(pantryTable.userId, userId));
  if (pantryItems.length === 0) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCooks = await db
    .select({ recipeId: cookSessions.recipeId })
    .from(cookSessions)
    .where(and(eq(cookSessions.userId, userId), isNotNull(cookSessions.completedAt), gte(cookSessions.completedAt, sevenDaysAgo)));
  const recentCookSet = new Set(recentCooks.map((r) => r.recipeId));

  const pantryMap = new Map<string, DbPantryItem>();
  for (const p of pantryItems) pantryMap.set(normalizeItemName(p.item), p);

  const expiringItemIds = new Set<number>();
  for (const p of pantryItems) {
    const status = computeExpiryStatus(p.expiresAt);
    if (status === 'expiring_soon' || status === 'expired') expiringItemIds.add(p.id);
  }

  const results: RecipeRecommendation[] = [];

  for (const recipe of recipeRows) {
    const ingredients = await db
      .select()
      .from(ingredientsTable)
      .where(eq(ingredientsTable.recipeId, recipe.id))
      .orderBy(asc(ingredientsTable.sortOrder));
    if (ingredients.length === 0) continue;

    const countable = ingredients.filter((ing) => !SKIP_INGREDIENTS.has(normalizeItemName(ing.item)));
    if (countable.length === 0) continue;

    const matchedIngredients: IngredientMatch[] = [];
    const missingIngredients: string[] = [];
    const usedExpiringNames: string[] = [];
    let matchedCount = 0;

    for (const ing of countable) {
      const ingNorm = normalizeItemName(ing.item);
      let matched = false;
      let matchedPantryItem: DbPantryItem | undefined;

      for (const [pantryNorm, pantryItem] of pantryMap) {
        if (fuzzyMatch(ingNorm, pantryNorm)) {
          matched = true;
          matchedPantryItem = pantryItem;
          break;
        }
      }

      const isExpiring = matched && matchedPantryItem != null ? expiringItemIds.has(matchedPantryItem.id) : false;

      if (matched) {
        matchedCount++;
        if (isExpiring && matchedPantryItem) usedExpiringNames.push(matchedPantryItem.displayName ?? matchedPantryItem.item);
      } else {
        missingIngredients.push(ing.item);
      }

      matchedIngredients.push({
        ingredient: ing.item,
        matched,
        pantryItemId: matchedPantryItem?.id,
        pantryItemName: matchedPantryItem?.displayName ?? matchedPantryItem?.item,
        isExpiring,
      });
    }

    const matchPercentage = Math.round((matchedCount / countable.length) * 100);
    if (matchPercentage < minMatch) continue;

    let score = matchPercentage;
    if (usedExpiringNames.length > 0) score += 20 + (usedExpiringNames.length - 1) * 5;
    if (recentCookSet.has(recipe.id)) score -= 10;

    const category: MatchCategory =
      matchPercentage === 100 ? 'ready' : matchPercentage >= 70 ? 'almost' : 'needs_shopping';

    results.push({
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      recipeCuisine: recipe.cuisine,
      recipeTime: recipe.cookTime ?? recipe.prepTime,
      recipeDifficulty: recipe.difficulty,
      matchPercentage,
      score,
      category,
      matchedIngredients,
      missingIngredients,
      usesExpiringItems: usedExpiringNames.length > 0,
      expiringIngredientNames: usedExpiringNames,
    });
  }

  results.sort((a, b) => {
    if (prioritizeExpiring && a.usesExpiringItems !== b.usesExpiringItems) return a.usesExpiringItems ? -1 : 1;
    return b.score - a.score;
  });

  return results.slice(0, limit);
}

// ── AI Suggestions ─────────────────────────────────────────────────────────────

const AISuggestionsSchema = z.object({
  recipes: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        cuisine: z.string(),
        cookTime: z.string(),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        ingredients: z.array(z.object({ item: z.string(), quantity: z.string() })),
        steps: z.array(z.string()),
      }),
    )
    .min(1)
    .max(3),
});

export async function getAISuggestions(
  userId: string,
  options: { prioritizeExpiring?: boolean } = {},
): Promise<AISuggestedRecipe[]> {
  const pantryItems = await db.select().from(pantryTable).where(eq(pantryTable.userId, userId));
  if (pantryItems.length === 0) return [];

  const expiringItems = pantryItems.filter((p) => {
    const s = computeExpiryStatus(p.expiresAt);
    return s === 'expiring_soon' || s === 'expired';
  });

  const pantryList = [
    ...(options.prioritizeExpiring ? expiringItems.map((p) => `${p.displayName ?? p.item} (use soon!)`) : []),
    ...pantryItems
      .filter((p) => computeExpiryStatus(p.expiresAt) === 'fresh')
      .map((p) => `${p.displayName ?? p.item}${p.quantity ? ` (${p.quantity}${p.unit ? ' ' + p.unit : ''})` : ''}`),
  ].join(', ');

  const prompt = `You are a helpful recipe assistant. Given these pantry items, suggest 3 creative and practical recipes that make good use of what's available.
${options.prioritizeExpiring && expiringItems.length > 0 ? 'PRIORITY: Include at least one recipe that uses the "use soon!" ingredients.' : ''}

Pantry: ${pantryList}

Respond with ONLY valid JSON, no other text:
{
  "recipes": [
    {
      "title": "Recipe Name",
      "description": "1-2 sentence description",
      "cuisine": "Cuisine type",
      "cookTime": "30 mins",
      "difficulty": "easy",
      "ingredients": [{ "item": "ingredient name", "quantity": "1 cup" }],
      "steps": ["Step 1 instruction", "Step 2 instruction"]
    }
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');

  return AISuggestionsSchema.parse(JSON.parse(jsonMatch[0])).recipes;
}

// ── Expiring Alerts ────────────────────────────────────────────────────────────

export async function getExpiringAlerts(userId: string): Promise<ExpiringAlert[]> {
  const pantryItems = await db.select().from(pantryTable).where(eq(pantryTable.userId, userId));
  const expiring = pantryItems.filter((p) => {
    const s = computeExpiryStatus(p.expiresAt);
    return s === 'expiring_soon' || s === 'expired';
  });
  if (expiring.length === 0) return [];

  const allRecs = await getPantryMatches(userId, { limit: 200, minMatch: 0, prioritizeExpiring: false });
  const alerts: ExpiringAlert[] = [];

  for (const pantryItem of expiring) {
    const status = computeExpiryStatus(pantryItem.expiresAt);
    const matchedRecipes = allRecs
      .filter((rec) => rec.matchedIngredients.some((mi) => mi.matched && mi.pantryItemId === pantryItem.id))
      .map((rec) => ({ recipeId: rec.recipeId, recipeTitle: rec.recipeTitle, matchPercentage: rec.matchPercentage }))
      .sort((a, b) => b.matchPercentage - a.matchPercentage)
      .slice(0, 3);

    alerts.push({
      pantryItemId: pantryItem.id,
      pantryItemName: pantryItem.displayName ?? pantryItem.item,
      expiresAt: pantryItem.expiresAt,
      expiryStatus: status as 'expiring_soon' | 'expired',
      matchedRecipes,
    });
  }

  return alerts;
}
