/**
 * Auto-tagger service.
 * Derives structured tags (cuisine, diet, method, time, category) from recipe content.
 *
 * Two-stage approach:
 * 1. Deterministic: map difficulty + cuisine fields directly (zero AI cost)
 * 2. Claude Haiku: semantic tags for diet, method, time, category
 *
 * Results are cached per recipeId (in-memory) to avoid redundant API calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db } from '../db/schema';
import type { DbIngredient, DbRecipe, DbStep } from '../db/schema';

// ── In-memory dedup cache ─────────────────────────────────────────────────────

const taggedRecipes = new Set<string>();

// ── Zod schema ────────────────────────────────────────────────────────────────

const TagSchema = z.object({
  tag: z.string(),
  type: z.enum(['cuisine', 'diet', 'difficulty', 'time', 'method', 'category', 'custom']),
});

const TagResponseSchema = z.object({
  tags: z.array(TagSchema).min(1).max(15),
});

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Analyze this recipe and generate relevant tags. Return ONLY valid JSON with no markdown:
{
  "tags": [
    { "tag": "Italian", "type": "cuisine" },
    { "tag": "Vegetarian", "type": "diet" },
    { "tag": "Under 30 Minutes", "type": "time" },
    { "tag": "One-Pot", "type": "method" },
    { "tag": "Dinner", "type": "category" },
    { "tag": "Budget-Friendly", "type": "custom" }
  ]
}

Tag types and allowed values:
- cuisine: Italian, Indian, Mexican, Thai, Japanese, Korean, Chinese, Mediterranean, American, French, Middle Eastern, Greek, Spanish, Vietnamese, Turkish, etc.
- diet: Vegetarian, Vegan, Gluten-Free, Dairy-Free, Keto, Low-Carb, Paleo, Halal, Nut-Free, High-Protein
- time: Under 15 Minutes, Under 30 Minutes, Under 1 Hour, Slow Cook
- method: One-Pot, Air Fryer, Instant Pot, No-Cook, Grilled, Baked, Stir-Fry, Meal Prep, Stovetop, Roasted, Steamed, Deep-Fried
- category: Breakfast, Lunch, Dinner, Snack, Dessert, Appetizer, Side Dish, Drink, Sauce, Soup, Salad
- custom: Budget-Friendly, Kid-Friendly, Date Night, Party Food, Comfort Food, High-Protein, Meal Prep Friendly

RULES:
- Generate 5-10 tags per recipe
- Be accurate: only tag "Vegan" if the recipe is actually vegan (no meat, fish, eggs, or dairy)
- Only tag "Gluten-Free" if no wheat/flour/bread/pasta is used
- Infer cook time from prepTime/cookTime fields provided
- Do NOT include cuisine or difficulty tags (those are derived from structured fields)`;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate and persist structured tags for a recipe.
 * Safe to call fire-and-forget — all errors are logged, never thrown.
 */
export async function tagRecipe(recipeId: string): Promise<void> {
  if (taggedRecipes.has(recipeId)) {
    return;
  }

  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(recipeId) as DbRecipe | undefined;

  if (!recipe) {
    console.warn(`[autoTagger] recipe ${recipeId} not found in DB`);
    return;
  }

  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(recipeId) as DbIngredient[];

  const steps = db
    .prepare('SELECT * FROM steps WHERE recipeId = ? ORDER BY stepNumber ASC')
    .all(recipeId) as DbStep[];

  // ── Stage 1: Deterministic tags ──────────────────────────────────────────
  const deterministicTags: Array<{ tag: string; type: string }> = [];

  if (recipe.difficulty) {
    const label = recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1);
    deterministicTags.push({ tag: label, type: 'difficulty' });
  }

  if (recipe.cuisine) {
    deterministicTags.push({ tag: recipe.cuisine, type: 'cuisine' });
  }

  // ── Stage 2: AI tags ─────────────────────────────────────────────────────
  const ingredientList = ingredients
    .map((i, idx) => `${idx + 1}. ${i.quantity} ${i.item}`)
    .join('\n');

  const stepsContext = steps
    .slice(0, 3)
    .map((s) => `${s.stepNumber}. ${s.instruction}`)
    .join('\n');

  const userMessage = `Recipe: "${recipe.title}"
${recipe.cuisine ? `Cuisine: ${recipe.cuisine}` : ''}
Difficulty: ${recipe.difficulty}
${recipe.prepTime ? `Prep time: ${recipe.prepTime}` : ''}
${recipe.cookTime ? `Cook time: ${recipe.cookTime}` : ''}

Ingredients:
${ingredientList}

Steps (first 3):
${stepsContext}`;

  let aiTags: Array<{ tag: string; type: string }> = [];

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('');

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = TagResponseSchema.parse(JSON.parse(cleaned));

    // Filter out cuisine/difficulty from AI response (handled deterministically)
    aiTags = parsed.tags.filter(
      (t) => t.type !== 'cuisine' && t.type !== 'difficulty',
    );
  } catch (err) {
    console.warn('[autoTagger] AI tagging failed, using deterministic tags only:', err);
  }

  // ── Persist tags ─────────────────────────────────────────────────────────
  const allTags = [...deterministicTags, ...aiTags];

  const insert = db.prepare(
    'INSERT INTO recipe_tags (recipeId, tag, type) VALUES (?, ?, ?)',
  );

  db.transaction(() => {
    // Clear existing tags first (safe to re-tag)
    db.prepare('DELETE FROM recipe_tags WHERE recipeId = ?').run(recipeId);
    for (const t of allTags) {
      insert.run(recipeId, t.tag, t.type);
    }
  })();

  taggedRecipes.add(recipeId);
}
