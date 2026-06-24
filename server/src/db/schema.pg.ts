import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  doublePrecision,
  serial,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import type { JobProgress } from '../queue/jobStore';
import type { ExtractionResult } from '../routes/extract';

// Multi-tenant Postgres schema (Supabase). Top-level tables carry user_id.
// The user_id -> auth.users foreign keys and RLS are added in Phase 2 when
// auth is wired; here user_id is a notNull uuid owner column.
// Child tables (ingredients, steps, tags, etc.) scope through their parent.

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    servings: text('servings'),
    prepTime: text('prep_time'),
    cookTime: text('cook_time'),
    difficulty: text('difficulty').notNull().default('medium'),
    cuisine: text('cuisine'),
    tags: text('tags').notNull().default('[]'),
    notes: text('notes'),
    sourceUrl: text('source_url'),
    platform: text('platform').notNull().default('unknown'),
    confidence: text('confidence').notNull().default('medium'),
    originalServings: integer('original_servings'),
    caloriesPerServing: integer('calories_per_serving'),
    proteinGrams: doublePrecision('protein_grams'),
    carbsGrams: doublePrecision('carbs_grams'),
    fatGrams: doublePrecision('fat_grams'),
    fiberGrams: doublePrecision('fiber_grams'),
    sugarGrams: doublePrecision('sugar_grams'),
    sodiumMg: doublePrecision('sodium_mg'),
    thumbnailUrl: text('thumbnail_url'),
    adaptedFrom: uuid('adapted_from'),
    adaptationType: text('adaptation_type'),
    nutritionConfidence: text('nutrition_confidence'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('idx_recipes_user_created').on(t.userId, t.createdAt),
  }),
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    item: text('item').notNull(),
    quantity: text('quantity').notNull(),
    category: text('category').notNull().default('other'),
    isOptional: boolean('is_optional').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    originalQuantity: text('original_quantity'),
    unit: text('unit'),
    numericQuantity: doublePrecision('numeric_quantity'),
    groceryAisle: text('grocery_aisle'),
  },
  (t) => ({ recipeIdx: index('idx_ingredients_recipe').on(t.recipeId) }),
);

export const steps = pgTable(
  'steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    stepNumber: integer('step_number').notNull(),
    instruction: text('instruction').notNull(),
    duration: text('duration'),
    tip: text('tip'),
  },
  (t) => ({ recipeIdx: index('idx_steps_recipe').on(t.recipeId, t.stepNumber) }),
);

export const pantry = pgTable(
  'pantry',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    item: text('item').notNull(),
    displayName: text('display_name'),
    quantity: text('quantity'),
    unit: text('unit'),
    category: text('category'),
    expiresAt: text('expires_at'),
    isStaple: boolean('is_staple').notNull().default(false),
    notes: text('notes'),
    addedAt: ts('added_at').notNull().defaultNow(),
  },
  (t) => ({ userItemIdx: index('idx_pantry_user_item').on(t.userId, t.item) }),
);

export const groceryLists = pgTable(
  'grocery_lists',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    recipeIds: text('recipe_ids'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('idx_grocery_lists_user').on(t.userId) }),
);

export const groceryListItems = pgTable(
  'grocery_list_items',
  {
    id: serial('id').primaryKey(),
    listId: integer('list_id')
      .notNull()
      .references(() => groceryLists.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'set null' }),
    recipeIds: text('recipe_ids'),
    item: text('item').notNull(),
    quantity: text('quantity'),
    unit: text('unit'),
    numericQuantity: doublePrecision('numeric_quantity'),
    aisle: text('aisle'),
    isChecked: boolean('is_checked').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({ listIdx: index('idx_grocery_items_list').on(t.listId) }),
);

export const collections = pgTable(
  'collections',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    emoji: text('emoji'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('idx_collections_user').on(t.userId) }),
);

export const recipeCollections = pgTable(
  'recipe_collections',
  {
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recipeId, t.collectionId] }),
    recipeIdx: index('idx_recipe_coll_recipe').on(t.recipeId),
  }),
);

export const recipeTags = pgTable(
  'recipe_tags',
  {
    id: serial('id').primaryKey(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    type: text('type').notNull(),
  },
  (t) => ({ recipeIdx: index('idx_recipe_tags_recipe').on(t.recipeId) }),
);

export const recipeAdaptations = pgTable(
  'recipe_adaptations',
  {
    id: serial('id').primaryKey(),
    originalRecipeId: uuid('original_recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    adaptedRecipeId: uuid('adapted_recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    adaptationType: text('adaptation_type').notNull(),
    prompt: text('prompt'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => ({ origIdx: index('idx_recipe_adapt_original').on(t.originalRecipeId) }),
);

// Shared lookup cache, not user-scoped.
export const nutritionCache = pgTable('nutrition_cache', {
  foodName: text('food_name').primaryKey(),
  calories100g: doublePrecision('calories_100g').notNull(),
  protein100g: doublePrecision('protein_100g').notNull(),
  carbs100g: doublePrecision('carbs_100g').notNull(),
  fat100g: doublePrecision('fat_100g').notNull(),
  fiber100g: doublePrecision('fiber_100g').notNull(),
  sugar100g: doublePrecision('sugar_100g').notNull(),
  sodium100g: doublePrecision('sodium_100g').notNull(),
  source: text('source').notNull().default('usda'),
  cachedAt: ts('cached_at').notNull().defaultNow(),
});

export const mealPlans = pgTable(
  'meal_plans',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('idx_meal_plans_user').on(t.userId) }),
);

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: serial('id').primaryKey(),
    mealPlanId: integer('meal_plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    mealSlot: text('meal_slot').notNull(),
    servings: integer('servings').notNull().default(2),
    isCooked: boolean('is_cooked').notNull().default(false),
    cookedAt: ts('cooked_at'),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
  },
  (t) => ({
    dateIdx: index('idx_mpe_date').on(t.date),
    planIdx: index('idx_mpe_plan').on(t.mealPlanId),
  }),
);

export const nutritionGoals = pgTable(
  'nutrition_goals',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    caloriesTarget: integer('calories_target').notNull().default(2000),
    proteinTarget: doublePrecision('protein_target').notNull().default(50),
    carbsTarget: doublePrecision('carbs_target').notNull().default(250),
    fatTarget: doublePrecision('fat_target').notNull().default(65),
    fiberTarget: doublePrecision('fiber_target').notNull().default(30),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('idx_nutrition_goals_user').on(t.userId) }),
);

export const cookSessions = pgTable(
  'cook_sessions',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    mealPlanEntryId: integer('meal_plan_entry_id').references(() => mealPlanEntries.id, {
      onDelete: 'set null',
    }),
    startedAt: ts('started_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
    servingsCooked: integer('servings_cooked').notNull().default(2),
    rating: integer('rating'),
    notes: text('notes'),
    photoUri: text('photo_uri'),
  },
  (t) => ({
    recipeIdx: index('idx_cook_sessions_recipe').on(t.recipeId),
    userIdx: index('idx_cook_sessions_user').on(t.userId),
  }),
);

// Durable extraction job state. Polled by the client across instances, so it
// cannot live in process memory once the API runs on multiple Cloud Run nodes.
export const extractionJobs = pgTable(
  'extraction_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    url: text('url').notNull(),
    status: text('status').notNull().default('queued'),
    progress: jsonb('progress').$type<JobProgress[]>().notNull().default([]),
    result: jsonb('result').$type<ExtractionResult>(),
    error: text('error'),
    // Per-extraction cost metering (Phase 4d). Which path ran + model usage, so
    // we can see real cost per job and enforce freemium quotas later.
    mode: text('mode'), // caption_first | full_pipeline | visual
    geminiInputTokens: integer('gemini_input_tokens'),
    geminiOutputTokens: integer('gemini_output_tokens'),
    claudeInputTokens: integer('claude_input_tokens'),
    claudeOutputTokens: integer('claude_output_tokens'),
    whisperSeconds: integer('whisper_seconds'),
    estimatedCostUsd: doublePrecision('estimated_cost_usd'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => ({ userCreatedIdx: index('idx_jobs_user_created').on(t.userId, t.createdAt) }),
);

// Inferred row types for the query layer.
export type DbRecipe = typeof recipes.$inferSelect;
export type DbIngredient = typeof ingredients.$inferSelect;
export type DbStep = typeof steps.$inferSelect;
export type DbPantryItem = typeof pantry.$inferSelect;
export type DbGroceryList = typeof groceryLists.$inferSelect;
export type DbGroceryListItem = typeof groceryListItems.$inferSelect;
export type DbCollection = typeof collections.$inferSelect;
export type DbRecipeTag = typeof recipeTags.$inferSelect;
export type DbRecipeAdaptation = typeof recipeAdaptations.$inferSelect;
export type DbNutritionCache = typeof nutritionCache.$inferSelect;
export type DbMealPlan = typeof mealPlans.$inferSelect;
export type DbMealPlanEntry = typeof mealPlanEntries.$inferSelect;
export type DbNutritionGoal = typeof nutritionGoals.$inferSelect;
export type DbCookSession = typeof cookSessions.$inferSelect;
export type DbExtractionJob = typeof extractionJobs.$inferSelect;
