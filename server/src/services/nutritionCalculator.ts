import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db } from '../db/schema';
import { WEIGHT_TO_G, VOLUME_TO_TSP, getUnitFamily } from '../utils/unitConversion';
import { parseIngredient } from '../utils/ingredientParser';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Indian / regional ingredient aliases ─────────────────────────────────────

const INGREDIENT_ALIASES: Record<string, string> = {
  paneer: 'cheese paneer',
  curd: 'yogurt whole milk',
  ghee: 'butter clarified',
  besan: 'chickpea flour',
  atta: 'whole wheat flour',
  maida: 'all-purpose flour',
  dal: 'lentils',
  'moong dal': 'mung beans',
  'toor dal': 'pigeon peas',
  'chana dal': 'chickpeas split',
  'urad dal': 'black gram',
  capsicum: 'bell pepper',
  'coriander leaves': 'cilantro',
  dhania: 'coriander seeds',
  jeera: 'cumin seeds',
  haldi: 'turmeric powder',
  methi: 'fenugreek leaves',
  hing: 'asafoetida',
  amchur: 'mango powder',
  'kasuri methi': 'fenugreek dried',
  'green chilli': 'chili pepper green',
  'red chilli': 'chili pepper red',
  'green chili': 'chili pepper green',
  'red chili': 'chili pepper red',
  'mustard seeds': 'mustard seeds',
  'curry leaves': 'curry leaves',
};

// Adjectives / cooking methods to strip before USDA lookup
const STRIP_WORDS = new Set([
  'finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'lightly',
  'chopped', 'sliced', 'diced', 'minced', 'grated', 'shredded', 'mashed',
  'boiled', 'cooked', 'fried', 'roasted', 'toasted', 'grilled', 'baked',
  'peeled', 'seeded', 'deveined', 'trimmed', 'cleaned', 'sifted', 'blanched',
  'powdered', 'crushed', 'crumbled', 'beaten', 'whisked', 'melted',
  'frozen', 'canned', 'packed', 'drained', 'rinsed', 'soaked',
  'heaped', 'level', 'rounded',
]);

function normalizeIngredientName(item: string): string {
  const lower = item.toLowerCase().trim();

  // Apply regional aliases first (try multi-word then single-word)
  for (const [alias, replacement] of Object.entries(INGREDIENT_ALIASES)) {
    if (lower === alias || lower.startsWith(alias + ' ') || lower.endsWith(' ' + alias)) {
      return replacement;
    }
  }

  // Strip parenthetical content e.g. "(about 200g)" or "(see note)"
  const noParen = lower.replace(/\([^)]*\)/g, '').trim();

  // Remove cooking adjectives
  const cleaned = noParen
    .split(/\s+/)
    .filter((w) => !STRIP_WORDS.has(w))
    .join(' ')
    .trim();

  return cleaned || lower;
}

// ── Volume → grams density table (grams per cup) ─────────────────────────────

const DENSITY_G_PER_CUP: Record<string, number> = {
  // Flours
  'flour': 120, 'all-purpose flour': 120, 'bread flour': 120,
  'whole wheat flour': 120, 'chickpea flour': 120, 'rice flour': 160,
  'cornstarch': 128, 'cornmeal': 150, 'semolina': 165, 'breadcrumbs': 120,
  // Grains (raw)
  'rice': 185, 'white rice': 185, 'brown rice': 195, 'basmati rice': 190,
  'jasmine rice': 185, 'quinoa': 170, 'oats': 90, 'rolled oats': 90,
  // Liquids
  'water': 240, 'milk': 244, 'whole milk': 244, 'skim milk': 244,
  'buttermilk': 245, 'cream': 238, 'heavy cream': 238, 'sour cream': 230,
  'yogurt': 245, 'yogurt whole milk': 245, 'coconut milk': 240,
  'broth': 240, 'stock': 240, 'coconut cream': 240,
  // Oils & fats
  'oil': 218, 'olive oil': 216, 'vegetable oil': 218, 'canola oil': 218,
  'coconut oil': 218, 'sesame oil': 218, 'sunflower oil': 218,
  'butter': 227, 'butter clarified': 205, 'ghee': 205, 'lard': 205,
  // Sweeteners
  'sugar': 200, 'white sugar': 200, 'brown sugar': 220,
  'powdered sugar': 120, 'confectioners sugar': 120,
  'honey': 340, 'maple syrup': 322, 'corn syrup': 340, 'molasses': 340,
  // Dairy
  'cheese': 113, 'cheese paneer': 220, 'cottage cheese': 225,
  'cream cheese': 230, 'ricotta': 246,
  // Sauces & condiments
  'tomato paste': 260, 'tomato sauce': 245, 'ketchup': 270,
  'soy sauce': 255, 'tahini': 240, 'peanut butter': 258,
  // Vegetables (chopped/diced)
  'onion': 160, 'tomato': 180, 'spinach': 30, 'cabbage': 90,
  'broccoli': 90, 'cauliflower': 107,
  // Nuts & seeds
  'almonds': 143, 'cashews': 130, 'peanuts': 145,
  'sesame seeds': 144, 'walnuts': 100,
  // Beans & legumes (cooked)
  'chickpeas': 164, 'lentils': 198, 'beans': 177,
};

function densityGPerCup(itemName: string): number {
  const lower = itemName.toLowerCase();
  if (DENSITY_G_PER_CUP[lower] !== undefined) return DENSITY_G_PER_CUP[lower];
  let best: number | null = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(DENSITY_G_PER_CUP)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }
  return best ?? 240; // default: water density
}

// ── Count/piece → grams table ─────────────────────────────────────────────────

const PIECE_WEIGHTS_G: Record<string, number> = {
  'egg': 50, 'large egg': 57, 'medium egg': 44, 'small egg': 38,
  'onion': 110, 'large onion': 150, 'medium onion': 110, 'small onion': 70,
  'tomato': 120, 'large tomato': 180, 'medium tomato': 120, 'small tomato': 80,
  'potato': 150, 'large potato': 200, 'medium potato': 150, 'small potato': 100,
  'garlic': 5, 'garlic clove': 5, 'clove garlic': 5, 'clove': 5,
  'green chilli': 5, 'green chili': 5, 'chili': 15, 'chili pepper': 15,
  'lemon': 85, 'lime': 67,
  'banana': 120, 'apple': 182, 'avocado': 200,
  'carrot': 61, 'cucumber': 300, 'zucchini': 200,
  // Package-type units: typical weights
  'can': 400, 'bunch': 40, 'head': 500, 'stalk': 40, 'sprig': 3,
  'leaf': 1, 'handful': 30, 'package': 200,
};

function toGramsByPiece(qty: number, itemName: string): number {
  const lower = itemName.toLowerCase();
  if (PIECE_WEIGHTS_G[lower] !== undefined) return qty * PIECE_WEIGHTS_G[lower];
  let best: number | null = null;
  let bestLen = 0;
  for (const [key, val] of Object.entries(PIECE_WEIGHTS_G)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = val;
      bestLen = key.length;
    }
  }
  return qty * (best ?? 50); // default: 50g per item
}

// ── Ingredient → grams conversion ─────────────────────────────────────────────

const TO_TASTE_RE = /\b(to taste|as needed|as required|pinch|dash|for frying|for coating|for serving|for garnish)\b/i;

function ingredientToGrams(
  qty: number,
  unit: string | null,
  item: string,
): number | null {
  const family = getUnitFamily(unit);

  if (family === 'weight') {
    return qty * (WEIGHT_TO_G[unit!.toLowerCase()] ?? 1);
  }

  if (family === 'volume') {
    const tsp = qty * (VOLUME_TO_TSP[unit!.toLowerCase()] ?? 1);
    const cups = tsp / 48;
    return cups * densityGPerCup(item);
  }

  // Count/piece (unit is null or a count word)
  return toGramsByPiece(qty, item);
}

// ── Nutrition cache (SQLite) ──────────────────────────────────────────────────

interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

function getCached(foodName: string): NutritionPer100g | null {
  const row = db
    .prepare(
      'SELECT calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, sodium_100g FROM nutrition_cache WHERE food_name = ?',
    )
    .get(foodName) as {
      calories_100g: number; protein_100g: number; carbs_100g: number;
      fat_100g: number; fiber_100g: number; sugar_100g: number; sodium_100g: number;
    } | undefined;

  if (!row) return null;
  return {
    calories: row.calories_100g, protein: row.protein_100g, carbs: row.carbs_100g,
    fat: row.fat_100g, fiber: row.fiber_100g, sugar: row.sugar_100g, sodium: row.sodium_100g,
  };
}

function setCache(foodName: string, data: NutritionPer100g, source: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO nutrition_cache
      (food_name, calories_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, sugar_100g, sodium_100g, source, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(foodName, data.calories, data.protein, data.carbs, data.fat, data.fiber, data.sugar, data.sodium, source);
}

// ── USDA FoodData Central API ─────────────────────────────────────────────────

const USDA_API_KEY = process.env.USDA_API_KEY ?? 'DEMO_KEY';
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Standard USDA nutrient IDs
const NID = {
  calories: 1008,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  fiber: 1079,
  sugar: 2000,
  sugarAlt: 1063, // older SR Legacy datasets
  sodium: 1093,
};

interface UsdaFood {
  foodNutrients: Array<{ nutrientId: number; value: number }>;
}

async function lookupUsda(query: string): Promise<NutritionPer100g | null> {
  try {
    const params = new URLSearchParams({
      query,
      dataType: 'Foundation,SR Legacy',
      pageSize: '1',
      api_key: USDA_API_KEY,
    });
    const res = await fetch(`${USDA_SEARCH_URL}?${params.toString()}`);
    if (!res.ok) {
      console.warn(`[nutrition] USDA API error ${res.status} for "${query}"`);
      return null;
    }

    const data = await res.json() as { foods?: UsdaFood[] };
    const food = data.foods?.[0];
    if (!food) return null;

    const nutrients: Record<number, number> = {};
    for (const n of food.foodNutrients) {
      nutrients[n.nutrientId] = n.value;
    }

    return {
      calories: nutrients[NID.calories] ?? 0,
      protein: nutrients[NID.protein] ?? 0,
      fat: nutrients[NID.fat] ?? 0,
      carbs: nutrients[NID.carbs] ?? 0,
      fiber: nutrients[NID.fiber] ?? 0,
      sugar: nutrients[NID.sugar] ?? nutrients[NID.sugarAlt] ?? 0,
      sodium: nutrients[NID.sodium] ?? 0,
    };
  } catch (err) {
    console.warn(`[nutrition] USDA fetch failed for "${query}":`, err);
    return null;
  }
}

async function getNutritionPer100g(foodName: string): Promise<NutritionPer100g | null> {
  const cached = getCached(foodName);
  if (cached) return cached;

  const result = await lookupUsda(foodName);
  if (result) {
    setCache(foodName, result, 'usda');
    return result;
  }
  return null;
}

// ── AI fallback (Haiku — only when USDA coverage is too low) ─────────────────

const AI_SYSTEM = `You are a nutrition calculator. Return ONLY valid JSON with no markdown:
{"perServing":{"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sugar":number,"sodium":number}}`;

const AiSchema = z.object({
  perServing: z.object({
    calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(),
    fiber: z.number(), sugar: z.number(), sodium: z.number(),
  }),
});

async function calculateWithAi(recipe: RecipeForNutrition, servings: number): Promise<NutritionResult> {
  const lines = recipe.ingredients
    .map((i) => `- ${i.quantity} ${i.item}`.trim())
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: AI_SYSTEM,
    messages: [{ role: 'user', content: `Recipe: ${recipe.title}\nServes: ${servings}\n\nIngredients:\n${lines}` }],
  });

  const content = msg.content[0];
  if (content.type !== 'text') throw new Error('Unexpected AI response type');

  const text = content.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const validated = AiSchema.parse(JSON.parse(text));
  const ps = validated.perServing;

  return {
    caloriesPerServing: Math.round(ps.calories / 5) * 5,
    proteinGrams: Math.round(ps.protein * 2) / 2,
    carbsGrams: Math.round(ps.carbs * 2) / 2,
    fatGrams: Math.round(ps.fat * 2) / 2,
    fiberGrams: Math.round(ps.fiber * 2) / 2,
    sugarGrams: Math.round(ps.sugar * 2) / 2,
    sodiumMg: Math.round(ps.sodium / 5) * 5,
    confidence: 'low',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NutritionResult {
  caloriesPerServing: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  sugarGrams: number;
  sodiumMg: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface RecipeForNutrition {
  title: string;
  servings: string | null;
  ingredients: Array<{
    item: string;
    quantity: string;
    numericQuantity?: number | null;
    unit?: string | null;
  }>;
}

function parseServingsCount(servings: string | null): number {
  if (!servings) return 4;
  const match = servings.match(/\d+/);
  return match ? parseInt(match[0], 10) : 4;
}

export async function calculateNutrition(recipe: RecipeForNutrition): Promise<NutritionResult> {
  const servings = parseServingsCount(recipe.servings);

  // ── Step 1: build (grams, normalizedName) for each countable ingredient ───

  interface IngLine {
    grams: number;
    foodName: string;
  }

  const lines: IngLine[] = [];

  for (const ing of recipe.ingredients) {
    const rawText = `${ing.quantity} ${ing.item}`.trim();

    // Skip to-taste / garnish / frying oil entries
    if (TO_TASTE_RE.test(rawText) || TO_TASTE_RE.test(ing.quantity)) continue;

    // Use pre-parsed DB values when available, otherwise parse from string
    let qty: number | null;
    let unit: string | null;
    let itemName: string;

    if (ing.numericQuantity !== undefined) {
      qty = ing.numericQuantity ?? null;
      unit = ing.unit ?? null;
      itemName = ing.item;
    } else {
      const parsed = parseIngredient(rawText);
      qty = parsed.numericQuantity;
      unit = parsed.unit;
      itemName = parsed.item || ing.item;
    }

    if (qty === null || qty <= 0) continue;

    const grams = ingredientToGrams(qty, unit, itemName);
    if (grams === null || grams <= 0) continue;

    const foodName = normalizeIngredientName(itemName);
    if (!foodName) continue;

    lines.push({ grams, foodName });
  }

  if (lines.length === 0) return calculateWithAi(recipe, servings);

  // ── Step 2: look up USDA nutrition for each unique food name ───────────────

  const uniqueNames = [...new Set(lines.map((l) => l.foodName))];
  const nutritionMap = new Map<string, NutritionPer100g>();

  for (const name of uniqueNames) {
    const result = await getNutritionPer100g(name);
    if (result) nutritionMap.set(name, result);
  }

  const foundCount = lines.filter((l) => nutritionMap.has(l.foodName)).length;
  const coverage = foundCount / lines.length;

  // ── Step 3: fall back to AI if coverage is insufficient ───────────────────

  if (coverage < 0.5) {
    console.log(`[nutrition] USDA coverage ${Math.round(coverage * 100)}% — falling back to AI`);
    return calculateWithAi(recipe, servings);
  }

  // ── Step 4: sum contributions ─────────────────────────────────────────────

  const totals: NutritionPer100g = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };

  for (const { grams, foodName } of lines) {
    const n = nutritionMap.get(foodName);
    if (!n) continue;
    const f = grams / 100;
    totals.calories += n.calories * f;
    totals.protein  += n.protein  * f;
    totals.carbs    += n.carbs    * f;
    totals.fat      += n.fat      * f;
    totals.fiber    += n.fiber    * f;
    totals.sugar    += n.sugar    * f;
    totals.sodium   += n.sodium   * f;
  }

  const ps = {
    calories: totals.calories / servings,
    protein:  totals.protein  / servings,
    carbs:    totals.carbs    / servings,
    fat:      totals.fat      / servings,
    fiber:    totals.fiber    / servings,
    sugar:    totals.sugar    / servings,
    sodium:   totals.sodium   / servings,
  };

  const confidence: 'high' | 'medium' | 'low' =
    coverage >= 0.9 ? 'high' :
    coverage >= 0.7 ? 'medium' : 'low';

  return {
    caloriesPerServing: Math.round(ps.calories / 5) * 5,
    proteinGrams: Math.round(ps.protein * 2) / 2,
    carbsGrams:   Math.round(ps.carbs   * 2) / 2,
    fatGrams:     Math.round(ps.fat     * 2) / 2,
    fiberGrams:   Math.round(ps.fiber   * 2) / 2,
    sugarGrams:   Math.round(ps.sugar   * 2) / 2,
    sodiumMg:     Math.round(ps.sodium  / 5) * 5,
    confidence,
  };
}
