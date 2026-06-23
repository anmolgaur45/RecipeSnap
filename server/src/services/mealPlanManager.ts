import { anthropicClient } from './aiClients';
import { z } from 'zod';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  mealPlans,
  mealPlanEntries,
  nutritionGoals,
  recipes,
  groceryLists,
  groceryListItems,
  type DbMealPlan,
  type DbMealPlanEntry,
  type DbNutritionGoal,
} from '../db/schema.pg';
import { depletFromRecipe } from './pantryManager';
import { buildListFromRecipes } from './groceryListBuilder';

const client = anthropicClient();

// ── Types ─────────────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner';
const VALID_SLOTS: MealSlot[] = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'];

export interface HydratedEntry extends DbMealPlanEntry {
  recipeTitle: string | null;
  recipeCuisine: string | null;
  recipeTime: string | null;
  nutrition: { calories: number; protein: number; carbs: number; fat: number; fiber: number } | null;
}

export interface HydratedPlan extends DbMealPlan {
  entries: HydratedEntry[];
}

export interface DayNutritionResult {
  date: string;
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  goals: DbNutritionGoal;
  percentages: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hydrateEntry(entry: DbMealPlanEntry): Promise<HydratedEntry> {
  const recipe = (
    await db
      .select({
        title: recipes.title,
        cuisine: recipes.cuisine,
        cookTime: recipes.cookTime,
        prepTime: recipes.prepTime,
        caloriesPerServing: recipes.caloriesPerServing,
        proteinGrams: recipes.proteinGrams,
        carbsGrams: recipes.carbsGrams,
        fatGrams: recipes.fatGrams,
        fiberGrams: recipes.fiberGrams,
      })
      .from(recipes)
      .where(eq(recipes.id, entry.recipeId))
      .limit(1)
  )[0];

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
    recipeTitle: recipe?.title ?? null,
    recipeCuisine: recipe?.cuisine ?? null,
    recipeTime: recipe?.cookTime ?? recipe?.prepTime ?? null,
    nutrition,
  };
}

async function ownedPlan(planId: number, userId: string): Promise<DbMealPlan | null> {
  const rows = await db
    .select()
    .from(mealPlans)
    .where(and(eq(mealPlans.id, planId), eq(mealPlans.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function ownedEntry(entryId: number, userId: string): Promise<DbMealPlanEntry | null> {
  const rows = await db
    .select({ entry: mealPlanEntries })
    .from(mealPlanEntries)
    .innerJoin(mealPlans, eq(mealPlanEntries.mealPlanId, mealPlans.id))
    .where(and(eq(mealPlanEntries.id, entryId), eq(mealPlans.userId, userId)))
    .limit(1);
  return rows[0]?.entry ?? null;
}

/** Return the user's active nutrition goal, creating a default one if none exists. */
async function getOrCreateActiveGoal(userId: string): Promise<DbNutritionGoal> {
  const existing = (
    await db
      .select()
      .from(nutritionGoals)
      .where(and(eq(nutritionGoals.userId, userId), eq(nutritionGoals.isActive, true)))
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db.insert(nutritionGoals).values({ userId }).returning();
  return created;
}

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

export async function createPlan(
  userId: string,
  startDate: string,
  endDate: string,
  name?: string,
): Promise<HydratedPlan> {
  await db
    .update(mealPlans)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(mealPlans.userId, userId), eq(mealPlans.isActive, true)));

  const [plan] = await db
    .insert(mealPlans)
    .values({ userId, name: name?.trim() || `Week of ${startDate}`, startDate, endDate, isActive: true })
    .returning();

  return { ...plan, entries: [] };
}

export async function getActivePlan(userId: string): Promise<HydratedPlan | null> {
  const plan = (
    await db
      .select()
      .from(mealPlans)
      .where(and(eq(mealPlans.userId, userId), eq(mealPlans.isActive, true)))
      .orderBy(desc(mealPlans.createdAt))
      .limit(1)
  )[0];
  if (!plan) return null;

  const entries = await db
    .select()
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.mealPlanId, plan.id))
    .orderBy(asc(mealPlanEntries.date), asc(mealPlanEntries.sortOrder), asc(mealPlanEntries.id));

  return { ...plan, entries: await Promise.all(entries.map(hydrateEntry)) };
}

export async function addEntry(
  userId: string,
  planId: number,
  recipeId: string,
  date: string,
  mealSlot: MealSlot,
  servings: number,
): Promise<HydratedEntry> {
  if (!VALID_SLOTS.includes(mealSlot)) {
    throw new Error(`Invalid meal slot: ${mealSlot}. Must be one of ${VALID_SLOTS.join(', ')}`);
  }
  const plan = await ownedPlan(planId, userId);
  if (!plan) throw new Error(`Meal plan ${planId} not found`);

  const recipe = (
    await db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))).limit(1)
  )[0];
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);

  const c = Number(
    (
      await db
        .select({ c: count() })
        .from(mealPlanEntries)
        .where(and(eq(mealPlanEntries.mealPlanId, planId), eq(mealPlanEntries.date, date), eq(mealPlanEntries.mealSlot, mealSlot)))
    )[0].c,
  );

  const [entry] = await db
    .insert(mealPlanEntries)
    .values({ mealPlanId: planId, recipeId, date, mealSlot, servings, sortOrder: c })
    .returning();

  return hydrateEntry(entry);
}

export async function updateEntry(
  userId: string,
  entryId: number,
  updates: { date?: string; mealSlot?: MealSlot; servings?: number; notes?: string },
): Promise<HydratedEntry> {
  const entry = await ownedEntry(entryId, userId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);
  if (updates.mealSlot && !VALID_SLOTS.includes(updates.mealSlot)) {
    throw new Error(`Invalid meal slot: ${updates.mealSlot}`);
  }

  const [updated] = await db
    .update(mealPlanEntries)
    .set({
      date: updates.date ?? entry.date,
      mealSlot: updates.mealSlot ?? entry.mealSlot,
      servings: updates.servings ?? entry.servings,
      notes: updates.notes !== undefined ? updates.notes : entry.notes,
    })
    .where(eq(mealPlanEntries.id, entryId))
    .returning();

  return hydrateEntry(updated);
}

export async function removeEntry(userId: string, entryId: number): Promise<void> {
  const entry = await ownedEntry(entryId, userId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, entryId));
}

export async function markCooked(userId: string, entryId: number): Promise<HydratedEntry> {
  const entry = await ownedEntry(entryId, userId);
  if (!entry) throw new Error(`Entry ${entryId} not found`);

  await db
    .update(mealPlanEntries)
    .set({ isCooked: true, cookedAt: new Date() })
    .where(eq(mealPlanEntries.id, entryId));

  try {
    await depletFromRecipe(userId, entry.recipeId, entry.servings);
  } catch {
    // Non-fatal — pantry may be empty or have no matching items
  }

  const [updated] = await db.select().from(mealPlanEntries).where(eq(mealPlanEntries.id, entryId)).limit(1);
  return hydrateEntry(updated);
}

export async function duplicateDay(
  userId: string,
  planId: number,
  sourceDate: string,
  targetDate: string,
): Promise<HydratedEntry[]> {
  const plan = await ownedPlan(planId, userId);
  if (!plan) return [];

  const entries = await db
    .select()
    .from(mealPlanEntries)
    .where(and(eq(mealPlanEntries.mealPlanId, planId), eq(mealPlanEntries.date, sourceDate)))
    .orderBy(asc(mealPlanEntries.sortOrder));
  if (entries.length === 0) return [];

  const inserted: DbMealPlanEntry[] = [];
  await db.transaction(async (tx) => {
    for (const e of entries) {
      const [n] = await tx
        .insert(mealPlanEntries)
        .values({
          mealPlanId: planId,
          recipeId: e.recipeId,
          date: targetDate,
          mealSlot: e.mealSlot,
          servings: e.servings,
          sortOrder: e.sortOrder,
        })
        .returning();
      inserted.push(n);
    }
  });

  return Promise.all(inserted.map(hydrateEntry));
}

// ── Nutrition ─────────────────────────────────────────────────────────────────

export async function getDayNutrition(userId: string, planId: number, date: string): Promise<DayNutritionResult> {
  const plan = await ownedPlan(planId, userId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const entries = await db
    .select()
    .from(mealPlanEntries)
    .where(and(eq(mealPlanEntries.mealPlanId, planId), eq(mealPlanEntries.date, date)));

  const goalRow = await getOrCreateActiveGoal(userId);
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

  for (const entry of entries) {
    const recipe = (
      await db
        .select({
          caloriesPerServing: recipes.caloriesPerServing,
          proteinGrams: recipes.proteinGrams,
          carbsGrams: recipes.carbsGrams,
          fatGrams: recipes.fatGrams,
          fiberGrams: recipes.fiberGrams,
        })
        .from(recipes)
        .where(eq(recipes.id, entry.recipeId))
        .limit(1)
    )[0];

    if (recipe?.caloriesPerServing != null) {
      totals.calories += Math.round((recipe.caloriesPerServing ?? 0) * entry.servings);
      totals.protein += Math.round((recipe.proteinGrams ?? 0) * entry.servings);
      totals.carbs += Math.round((recipe.carbsGrams ?? 0) * entry.servings);
      totals.fat += Math.round((recipe.fatGrams ?? 0) * entry.servings);
      totals.fiber += Math.round((recipe.fiberGrams ?? 0) * entry.servings);
    }
  }

  const pct = (val: number, target: number) => Math.min(Math.round((val / target) * 100), 999);
  const percentages = {
    calories: pct(totals.calories, goalRow.caloriesTarget),
    protein: pct(totals.protein, goalRow.proteinTarget),
    carbs: pct(totals.carbs, goalRow.carbsTarget),
    fat: pct(totals.fat, goalRow.fatTarget),
    fiber: pct(totals.fiber, goalRow.fiberTarget),
  };

  return { date, totals, goals: goalRow, percentages };
}

export async function getWeekNutrition(userId: string, planId: number): Promise<DayNutritionResult[]> {
  const plan = await ownedPlan(planId, userId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const results: DayNutritionResult[] = [];
  const start = new Date(plan.startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    results.push(await getDayNutrition(userId, planId, d.toISOString().split('T')[0]));
  }
  return results;
}

// ── Grocery list generation ───────────────────────────────────────────────────

export async function generateGroceryListFromPlan(
  userId: string,
  planId: number,
): Promise<{ listId: number; itemCount: number }> {
  const plan = await ownedPlan(planId, userId);
  if (!plan) throw new Error(`Plan ${planId} not found`);

  const entries = await db
    .selectDistinct({ recipeId: mealPlanEntries.recipeId })
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.mealPlanId, planId));
  if (entries.length === 0) throw new Error('No entries in this plan');

  const recipeIds = entries.map((e) => e.recipeId);
  const items = await buildListFromRecipes(userId, recipeIds, true);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const listName = `${plan.name} ${dateStr}`;

  const list = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(groceryLists)
      .values({ userId, name: listName, recipeIds: JSON.stringify(recipeIds) })
      .returning();
    if (items.length > 0) {
      await tx.insert(groceryListItems).values(items.map((it) => ({ ...it, listId: created.id })));
    }
    return created;
  });

  return { listId: list.id, itemCount: items.length };
}

// ── Nutrition goals ───────────────────────────────────────────────────────────

export async function getGoals(userId: string): Promise<DbNutritionGoal> {
  return getOrCreateActiveGoal(userId);
}

export async function updateGoals(
  userId: string,
  updates: { caloriesTarget?: number; proteinTarget?: number; carbsTarget?: number; fatTarget?: number; fiberTarget?: number },
): Promise<DbNutritionGoal> {
  const goal = await getOrCreateActiveGoal(userId);
  const [updated] = await db
    .update(nutritionGoals)
    .set({
      caloriesTarget: updates.caloriesTarget ?? goal.caloriesTarget,
      proteinTarget: updates.proteinTarget ?? goal.proteinTarget,
      carbsTarget: updates.carbsTarget ?? goal.carbsTarget,
      fatTarget: updates.fatTarget ?? goal.fatTarget,
      fiberTarget: updates.fiberTarget ?? goal.fiberTarget,
      updatedAt: new Date(),
    })
    .where(eq(nutritionGoals.id, goal.id))
    .returning();
  return updated;
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

  return GoalSuggestionSchema.parse(JSON.parse(jsonMatch[0]));
}
