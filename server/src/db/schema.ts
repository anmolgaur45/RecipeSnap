import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'recipesnap.db');

// Ensure the data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Idempotent ALTER TABLE helper — skips if column already exists */
function addColumnIfNotExists(tableName: string, columnName: string, columnDef: string): void {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
  if (!columns.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  }
}

export function initDb(): void {
  // ── Core tables ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      servings    TEXT,
      prepTime    TEXT,
      cookTime    TEXT,
      difficulty  TEXT NOT NULL DEFAULT 'medium',
      cuisine     TEXT,
      tags        TEXT NOT NULL DEFAULT '[]',
      notes       TEXT,
      sourceUrl   TEXT NOT NULL,
      platform    TEXT NOT NULL DEFAULT 'unknown',
      confidence  TEXT NOT NULL DEFAULT 'medium',
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id          TEXT PRIMARY KEY,
      recipeId    TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      item        TEXT NOT NULL,
      quantity    TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'other',
      isOptional  INTEGER NOT NULL DEFAULT 0,
      sortOrder   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS steps (
      id          TEXT PRIMARY KEY,
      recipeId    TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      stepNumber  INTEGER NOT NULL,
      instruction TEXT NOT NULL,
      duration    TEXT,
      tip         TEXT
    );

    -- ── Pantry ──────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pantry (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      item      TEXT NOT NULL,
      quantity  TEXT,
      unit      TEXT,
      category  TEXT,
      addedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT,
      isStaple  INTEGER NOT NULL DEFAULT 0
    );

    -- ── Grocery lists ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS grocery_lists (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      isActive  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS grocery_list_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      listId          INTEGER NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
      recipeId        TEXT REFERENCES recipes(id),
      item            TEXT NOT NULL,
      quantity        TEXT,
      unit            TEXT,
      numericQuantity REAL,
      aisle           TEXT,
      isChecked       INTEGER NOT NULL DEFAULT 0,
      sortOrder       INTEGER NOT NULL DEFAULT 0
    );

    -- ── Collections ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS collections (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      emoji     TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_collections (
      recipeId     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      collectionId INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      PRIMARY KEY (recipeId, collectionId)
    );

    -- ── Tags (normalized) ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS recipe_tags (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      recipeId TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      tag      TEXT NOT NULL,
      type     TEXT NOT NULL
    );

    -- ── Adaptation history ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS recipe_adaptations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      originalRecipeId TEXT NOT NULL REFERENCES recipes(id),
      adaptedRecipeId  TEXT NOT NULL REFERENCES recipes(id),
      adaptationType   TEXT NOT NULL,
      prompt           TEXT,
      createdAt        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Nutrition lookup cache ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS nutrition_cache (
      food_name      TEXT PRIMARY KEY,
      calories_100g  REAL NOT NULL,
      protein_100g   REAL NOT NULL,
      carbs_100g     REAL NOT NULL,
      fat_100g       REAL NOT NULL,
      fiber_100g     REAL NOT NULL,
      sugar_100g     REAL NOT NULL,
      sodium_100g    REAL NOT NULL,
      source         TEXT NOT NULL DEFAULT 'usda',
      cached_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Indexes ──────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_ingredients_recipe    ON ingredients(recipeId);
    CREATE INDEX IF NOT EXISTS idx_steps_recipe          ON steps(recipeId, stepNumber);
    CREATE INDEX IF NOT EXISTS idx_recipes_created       ON recipes(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_pantry_item           ON pantry(item);
    CREATE INDEX IF NOT EXISTS idx_grocery_items_list    ON grocery_list_items(listId);
    CREATE INDEX IF NOT EXISTS idx_recipe_tags_recipe    ON recipe_tags(recipeId);
    CREATE INDEX IF NOT EXISTS idx_recipe_coll_recipe    ON recipe_collections(recipeId);
    CREATE INDEX IF NOT EXISTS idx_recipe_adapt_original ON recipe_adaptations(originalRecipeId);
  `);

  // ── Column migrations on existing tables (idempotent) ────────────────────
  // recipes — nutrition & serving fields
  addColumnIfNotExists('recipes', 'originalServings',   'INTEGER');
  addColumnIfNotExists('recipes', 'caloriesPerServing', 'INTEGER');
  addColumnIfNotExists('recipes', 'proteinGrams',       'REAL');
  addColumnIfNotExists('recipes', 'carbsGrams',         'REAL');
  addColumnIfNotExists('recipes', 'fatGrams',           'REAL');
  addColumnIfNotExists('recipes', 'fiberGrams',         'REAL');
  addColumnIfNotExists('recipes', 'sugarGrams',         'REAL');
  addColumnIfNotExists('recipes', 'sodiumMg',           'REAL');

  // ingredients — parsed quantity fields
  addColumnIfNotExists('ingredients', 'originalQuantity', 'TEXT');
  addColumnIfNotExists('ingredients', 'unit',             'TEXT');
  addColumnIfNotExists('ingredients', 'numericQuantity',  'REAL');
  addColumnIfNotExists('ingredients', 'groceryAisle',     'TEXT');

  // grocery_lists — track which recipes sourced the list
  addColumnIfNotExists('grocery_lists', 'recipeIds', 'TEXT');

  // grocery_list_items — track all contributing recipe IDs per consolidated item
  addColumnIfNotExists('grocery_list_items', 'recipeIds', 'TEXT');

  // recipes — adaptation provenance
  addColumnIfNotExists('recipes', 'adaptedFrom',       'TEXT');
  addColumnIfNotExists('recipes', 'adaptationType',    'TEXT');

  // recipes — nutrition confidence
  addColumnIfNotExists('recipes', 'nutritionConfidence', 'TEXT');
}

// ── TypeScript interfaces ─────────────────────────────────────────────────────

export interface DbRecipe {
  id: string;
  title: string;
  description: string | null;
  servings: string | null;
  prepTime: string | null;
  cookTime: string | null;
  difficulty: string;
  cuisine: string | null;
  tags: string; // JSON array
  notes: string | null;
  sourceUrl: string;
  platform: string;
  confidence: string;
  createdAt: string;
  updatedAt: string;
  // Nutrition / serving extension columns (nullable — added via migration)
  originalServings: number | null;
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
  // Adaptation provenance (nullable — added via migration)
  adaptedFrom: string | null;
  adaptationType: string | null;
  // Nutrition confidence (nullable — added via migration)
  nutritionConfidence: string | null;
}

export interface DbIngredient {
  id: string;
  recipeId: string;
  item: string;
  quantity: string;
  category: string;
  isOptional: number;
  sortOrder: number;
  // Parsed quantity fields (nullable — added via migration)
  originalQuantity: string | null;
  unit: string | null;
  numericQuantity: number | null;
  groceryAisle: string | null;
}

export interface DbStep {
  id: string;
  recipeId: string;
  stepNumber: number;
  instruction: string;
  duration: string | null;
  tip: string | null;
}

export interface DbPantryItem {
  id: number;
  item: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  addedAt: string;
  expiresAt: string | null;
  isStaple: number;
}

export interface DbGroceryList {
  id: number;
  name: string;
  createdAt: string;
  isActive: number;
  recipeIds: string | null; // JSON array of recipe UUIDs
}

export interface DbGroceryListItem {
  id: number;
  listId: number;
  recipeId: string | null;    // legacy: first contributing recipe
  recipeIds: string | null;   // JSON array of all contributing recipe UUIDs
  item: string;
  quantity: string | null;
  unit: string | null;
  numericQuantity: number | null;
  aisle: string | null;
  isChecked: number;
  sortOrder: number;
}

export interface DbCollection {
  id: number;
  name: string;
  emoji: string | null;
  createdAt: string;
}

export interface DbRecipeTag {
  id: number;
  recipeId: string;
  tag: string;
  type: string;
}

export interface DbRecipeAdaptation {
  id: number;
  originalRecipeId: string;
  adaptedRecipeId: string;
  adaptationType: string;
  prompt: string | null;
  createdAt: string;
}

export interface DbNutritionCache {
  food_name: string;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  sugar_100g: number;
  sodium_100g: number;
  source: string;
  cached_at: string;
}
