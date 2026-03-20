import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db, DbMealPlan, DbMealPlanEntry, DbNutritionGoal } from '../db/schema';
import { depletFromRecipe } from './pantryManager';
import { buildListFromRecipes } from './groceryListBuilder';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner';
const VALID_SLOTS: MealSlot[] = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'];

export interface HydratedEntry extends Omit<DbMealPlanEntry, 'isCooked'> {
  isCooked: boolean;
  recipeTitle: string | null;
  recipeCuisine: string | null;
  recipeTime: string | null;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  } | null;
}

export interface HydratedPlan extends Omit<DbMealPlan, 'isActive'> {
  isActive: boolean;
  entries: HydratedEntry[];
}

export interface DayNutritionResult {
  date: string;
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  goals: {
    id: number;
    caloriesTarget: number;
    proteinTarget: number;
    carbsTarget: number;
    fatTarget: number;
    fiberTarget: number;
    isActive: boolean;
  };
  percentages: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RecipeNutritionRow = {
  title: string;
  cuisine: string | null;
  cookTime: string | null;
  prepTime: string | null;
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
};

function hydrateEntry(entry: DbMealPlanEntry): HydratedEntry {
  const recipe = db
    .prepare(
      'SELECT title, cuisine, cookTime, prepTime, caloriesPerServing, proteinGrams, carbsGrams, fatGrams, fiberGrams FROM recipes WHERE id = ?'
    )
    .get(entry.recipeId) as RecipeNutritionRow | undefined;

  const nutrition =
    recipe?.caloriesPerServing != null
      ? {
          calories: Math.round((recipe.caloriesPerServing ?? 0) * entry.servings),
          protein: Math.round((recipe.proteinGrams ?? 0) * entry.servings),
          carbs: Math.round((recipe.carbsGrams ?? 0) * entry.servings),
          fat: Math.round((recipe.fatGrams ?? 0) * entry.servings),
          fiber: Math.round((recipe.fiberGrams ?? 0) * entry.servings),
        }
      : null;

  return {
    ...entry,
    isCooked: entry.isCooked === 1,
    recipeTitle: recipe?.title ?? null,
    recipeCuisine: recipe?.cuisine ?? null,
    recipeTime: recipe?.cookTime ?? recipe?.prepTime ?? null,
    nutrition,
  };
}

function serializeGoal(goal: DbNutritionGoal) {
  return { ...goal, isActive: goal.isActive === 1 };
}

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

export function createPlan(startDate: string, endDate: string, name?: string): HydratedPlan {
  db.prepare(
    "UPDATE meal_plans SET isActive = 0, updatedAt = datetime('now') WHERE isActive = 1"
  ).run();

  const planName = name?.trim() || `Week of ${startDate}`;
  const result = db
    .prepare('INSERT INTO meal_plans (name, startDate, endDate, isActive) VALUES (?, ?, ?, 1)')
    .run(planName, startDate, endDate);

  const plan = db
    .prepare('SELECT * FROM meal_plans WHERE id = ?')
    .get(result.lastInsertRowid) as DbMealPlan;

  return { ...plan, isActive: true, entries: [] };
}

export function getActivePlan(): HydratedPlan | null {
  const plan = db
    .prepare('SELECT * FROM meal_plans WHERE isActive = 1 ORDER BY createdAt DESC LIMIT 1')
    .get() as DbMealPlan | undefined;

  if (!plan) return null;

  const entries = db
    .prepare(
      'SELECT * FROM meal_plan_entries WHERE mealPlanId = ? ORDER BY date ASC, sortOrder ASC, id ASC'
    )
    .all(plan.id) as DbMealPlanEntry[];

  return {
    ...plan,
    isActive: plan.isActive === 1,
    entries: entries.map(hydrateEntry),
  };
}

export function addEntry(
  planId: number,
  recipeId: string,
  date: string,
  mealSlot: MealSlot,
  servings: number
): HydratedEntry {
  if (!VALID_SLOTS.includes(mealSlot)) {
    throw new Error(`Invalid meal slot: ${mealSlot}. Must be one of ${VALID_SLOTS.join(', ')}`);
  }

  const plan = db.prepare('SELECT id FROM meal_plans WHERE id = ?').get(planId);
  if (!plan) throw new Error(`Meal plan ${planId} not found`);

  const recipe = db.prepare('SELECT id FROM recipes WHERE id = ?').get(recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const countRow = db
    .prepare(
      'SELECT COUNT(*) as c FROM meal_plan_entries WHERE mealPlanId = ? AND date = ? AND mealSlot = ?'
    )
    .get(planId, date, mealSlot) as { c: number };

  const result = db
    .prepare(
      'INSERT INTO meal_plan_entries (mealPlanId, recipeId, date, mealSlot, servings, sortOrder) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(planId, recipeId, date, mealSlot, servings, countRow.c);

  const entry = db
    .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
    .get(result.lastInsertRowid) as DbMealPlanEntry;

  return hydrateEntry(entry);
}

export function updateEntry(
  entryId: number,
  updates: { date?: string; mealSlot?: MealSlot; servings?: number; notes?: string }
): HydratedEntry {
  const entry = db
    .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
    .get(entryId) as DbMealPlanEntry | undefined;

  if (!entry) throw new Error(`Entry ${entryId} not found`);

  if (updates.mealSlot && !VALID_SLOTS.includes(updates.mealSlot)) {
    throw new Error(`Invalid meal slot: ${updates.mealSlot}`);
  }

  const newDate = updates.date ?? entry.date;
  const newSlot = updates.mealSlot ?? (entry.mealSlot as MealSlot);
  const newServings = updates.servings ?? entry.servings;
  const newNotes = updates.notes !== undefined ? updates.notes : entry.notes;

  db.prepare(
    'UPDATE meal_plan_entries SET date = ?, mealSlot = ?, servings = ?, notes = ? WHERE id = ?'
  ).run(newDate, newSlot, newServings, newNotes, entryId);

  const updated = db
    .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
    .get(entryId) as DbMealPlanEntry;

  return hydrateEntry(updated);
}

export function removeEntry(entryId: number): void {
  const entry = db.prepare('SELECT id FROM meal_plan_entries WHERE id = ?').get(entryId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);
  db.prepare('DELETE FROM meal_plan_entries WHERE id = ?').run(entryId);
}

export function markCooked(entryId: number): HydratedEntry {
  const entry = db
    .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
    .get(entryId) as DbMealPlanEntry | undefined;

  if (!entry) throw new Error(`Entry ${entryId} not found`);

  db.prepare(
    "UPDATE meal_plan_entries SET isCooked = 1, cookedAt = datetime('now') WHERE id = ?"
  ).run(entryId);

  try {
    depletFromRecipe(entry.recipeId, entry.servings);
  } catch (_e) {
    // Non-fatal — pantry may be empty or have no matching items
  }

  const updated = db
    .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
    .get(entryId) as DbMealPlanEntry;

  return hydrateEntry(updated);
}

export function duplicateDay(
  planId: number,
  sourceDate: string,
  targetDate: string
): HydratedEntry[] {
  const entries = db
    .prepare(
      'SELECT * FROM meal_plan_entries WHERE mealPlanId = ? AND date = ? ORDER BY sortOrder ASC'
    )
    .all(planId, sourceDate) as DbMealPlanEntry[];

  if (entries.length === 0) return [];

  const insert = db.prepare(
    'INSERT INTO meal_plan_entries (mealPlanId, recipeId, date, mealSlot, servings, sortOrder) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const newEntries: HydratedEntry[] = [];

  const run = db.transaction(() => {
    for (const entry of entries) {
      const r = insert.run(
        planId,
        entry.recipeId,
        targetDate,
        entry.mealSlot,
        entry.servings,
        entry.sortOrder
      );
      const newEntry = db
        .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
        .get(r.lastInsertRowid) as DbMealPlanEntry;
      newEntries.push(hydrateEntry(newEntry));
    }
  });

  run();
  return newEntries;
}

// ── Nutrition ─────────────────────────────────────────────────────────────────

export function getDayNutrition(planId: number, date: string): DayNutritionResult {
  const entries = db
    .prepare('SELECT * FROM meal_plan_entries WHERE mealPlanId = ? AND date = ?')
    .all(planId, date) as DbMealPlanEntry[];

  const goalRow = db
    .prepare('SELECT * FROM nutrition_goals WHERE isActive = 1 LIMIT 1')
    .get() as DbNutritionGoal;

  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  for (const entry of entries) {
    const recipe = db
      .prepare(
        'SELECT caloriesPerServing, proteinGrams, carbsGrams, fatGrams, fiberGrams FROM recipes WHERE id = ?'
      )
      .get(entry.recipeId) as {
      caloriesPerServing: number | null;
      proteinGrams: number | null;
      carbsGrams: number | null;
      fatGrams: number | null;
      fiberGrams: number | null;
    } | undefined;

    if (recipe?.caloriesPerServing != null) {
      totals.calories += Math.round((recipe.caloriesPerServing ?? 0) * entry.servings);
      totals.protein += Math.round((recipe.proteinGrams ?? 0) * entry.servings);
      totals.carbs += Math.round((recipe.carbsGrams ?? 0) * entry.servings);
      totals.fat += Math.round((recipe.fatGrams ?? 0) * entry.servings);
      totals.fiber += Math.round((recipe.fiberGrams ?? 0) * entry.servings);
    }
  }

  const percentages = goalRow
    ? {
        calories: Math.min(Math.round((totals.calories / goalRow.caloriesTarget) * 100), 999),
        protein: Math.min(Math.round((totals.protein / goalRow.proteinTarget) * 100), 999),
        carbs: Math.min(Math.round((totals.carbs / goalRow.carbsTarget) * 100), 999),
        fat: Math.min(Math.round((totals.fat / goalRow.fatTarget) * 100), 999),
        fiber: Math.min(Math.round((totals.fiber / goalRow.fiberTarget) * 100), 999),
      }
    : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  return {
    date,
    totals,
    goals: serializeGoal(goalRow),
    percentages,
  };
}

export function getWeekNutrition(planId: number): DayNutritionResult[] {
  const plan = db
    .prepare('SELECT * FROM meal_plans WHERE id = ?')
    .get(planId) as DbMealPlan | undefined;

  if (!plan) throw new Error(`Plan ${planId} not found`);

  const results: DayNutritionResult[] = [];
  const start = new Date(plan.startDate);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    results.push(getDayNutrition(planId, dateStr));
  }

  return results;
}

// ── Grocery list generation ───────────────────────────────────────────────────

export function generateGroceryListFromPlan(
  planId: number
): { listId: number; itemCount: number } {
  const plan = db
    .prepare('SELECT * FROM meal_plans WHERE id = ?')
    .get(planId) as DbMealPlan | undefined;

  if (!plan) throw new Error(`Plan ${planId} not found`);

  const entries = db
    .prepare('SELECT DISTINCT recipeId FROM meal_plan_entries WHERE mealPlanId = ?')
    .all(planId) as { recipeId: string }[];

  if (entries.length === 0) throw new Error('No entries in this plan');

  const recipeIds = entries.map((e) => e.recipeId);
  const items = buildListFromRecipes(recipeIds, true); // subtract pantry

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const listName = `${plan.name} — ${dateStr}`;

  const insertList = db.prepare('INSERT INTO grocery_lists (name, recipeIds) VALUES (?, ?)');
  const insertItem = db.prepare(`
    INSERT INTO grocery_list_items
      (listId, recipeId, recipeIds, item, quantity, unit, numericQuantity, aisle, sortOrder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let listId = 0;

  const run = db.transaction(() => {
    const r = insertList.run(listName, JSON.stringify(recipeIds));
    listId = r.lastInsertRowid as number;
    for (const item of items) {
      insertItem.run(
        listId,
        item.recipeId,
        item.recipeIds,
        item.item,
        item.quantity,
        item.unit,
        item.numericQuantity,
        item.aisle,
        item.sortOrder
      );
    }
  });

  run();

  return { listId, itemCount: items.length };
}

// ── Nutrition goals ───────────────────────────────────────────────────────────

export function getGoals(): ReturnType<typeof serializeGoal> {
  const goals = db
    .prepare('SELECT * FROM nutrition_goals WHERE isActive = 1 LIMIT 1')
    .get() as DbNutritionGoal | undefined;

  if (!goals) throw new Error('No nutrition goals found');
  return serializeGoal(goals);
}

export function updateGoals(updates: {
  caloriesTarget?: number;
  proteinTarget?: number;
  carbsTarget?: number;
  fatTarget?: number;
  fiberTarget?: number;
}): ReturnType<typeof serializeGoal> {
  const goals = db
    .prepare('SELECT * FROM nutrition_goals WHERE isActive = 1 LIMIT 1')
    .get() as DbNutritionGoal | undefined;

  if (!goals) throw new Error('No nutrition goals found');

  db.prepare(`
    UPDATE nutrition_goals SET
      caloriesTarget = ?,
      proteinTarget = ?,
      carbsTarget = ?,
      fatTarget = ?,
      fiberTarget = ?,
      updatedAt = datetime('now')
    WHERE id = ?
  `).run(
    updates.caloriesTarget ?? goals.caloriesTarget,
    updates.proteinTarget ?? goals.proteinTarget,
    updates.carbsTarget ?? goals.carbsTarget,
    updates.fatTarget ?? goals.fatTarget,
    updates.fiberTarget ?? goals.fiberTarget,
    goals.id
  );

  const updated = db
    .prepare('SELECT * FROM nutrition_goals WHERE id = ?')
    .get(goals.id) as DbNutritionGoal;

  return serializeGoal(updated);
}

// ── AI goal suggestion ────────────────────────────────────────────────────────

const GoalSuggestionSchema = z.object({
  goals: z.object({
    caloriesTarget: z.number().int().min(1000).max(5000),
    proteinTarget: z.number().min(20).max(300),
    carbsTarget: z.number().min(50).max(600),
    fatTarget: z.number().min(20).max(200),
    fiberTarget: z.number().min(10).max(100),
  }),
  reasoning: z.string(),
});

export async function suggestGoalsAI(profile: {
  age?: number;
  weightKg?: number;
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal?: 'lose' | 'maintain' | 'gain';
}): Promise<{ goals: z.infer<typeof GoalSuggestionSchema>['goals']; reasoning: string }> {
  const profileStr = [
    profile.age ? `Age: ${profile.age}` : null,
    profile.weightKg ? `Weight: ${profile.weightKg}kg` : null,
    profile.activityLevel ? `Activity level: ${profile.activityLevel}` : null,
    profile.goal ? `Goal: ${profile.goal} weight` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Suggest daily nutrition goals for: ${profileStr || 'average adult'}.
Return JSON only:
{"goals":{"caloriesTarget":2000,"proteinTarget":50,"carbsTarget":250,"fatTarget":65,"fiberTarget":30},"reasoning":"brief explanation"}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON');

  const parsed = GoalSuggestionSchema.parse(JSON.parse(jsonMatch[0]));
  return parsed;
}
