const BASE = 'https://www.themealdb.com/api/json/v1/1';

// Categories that rotate daily for the Discover section
const CATEGORIES = ['Chicken', 'Seafood', 'Pasta', 'Beef', 'Vegetarian', 'Dessert', 'Lamb', 'Starter'];

// Loose mapping: user's cuisine preference → TheMealDB category
const CUISINE_TO_CATEGORY: Record<string, string> = {
  italian: 'Pasta',
  chinese: 'Chicken',
  indian: 'Lamb',
  mexican: 'Beef',
  thai: 'Chicken',
  japanese: 'Seafood',
  mediterranean: 'Seafood',
  american: 'Beef',
  french: 'Starter',
  greek: 'Lamb',
};

export interface MealSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}

export interface MealDetail {
  idMeal: string;
  strMeal: string;
  strCategory: string;
  strArea: string;
  strInstructions: string;
  strMealThumb: string;
  strYoutube: string;
  [key: string]: string; // strIngredient1..20, strMeasure1..20
}

/**
 * Pick a TheMealDB category — preference-biased if favoriteCuisines provided,
 * else deterministic daily rotation.
 */
function pickCategory(favoriteCuisines: string[]): string {
  for (const cuisine of favoriteCuisines) {
    const category = CUISINE_TO_CATEGORY[cuisine.toLowerCase()];
    if (category) return category;
  }
  const dayOfYear = Math.floor(Date.now() / 86400000);
  return CATEGORIES[dayOfYear % CATEGORIES.length];
}

function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * Fetch up to `limit` meals from a TheMealDB category, preference-biased.
 * Returns [] on network error (Discover section gracefully hides).
 */
export async function getDiscoverMeals(
  favoriteCuisines: string[] = [],
  limit = 10,
): Promise<MealSummary[]> {
  try {
    const category = pickCategory(favoriteCuisines);
    const res = await fetchWithTimeout(`${BASE}/filter.php?c=${category}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { meals: MealSummary[] | null };
    if (!data.meals) return [];
    // Shuffle deterministically by today's date so order varies daily
    const dayKey = Math.floor(Date.now() / 86400000);
    const shuffled = [...data.meals].sort(
      (a, b) => ((dayKey * 2654435761) ^ a.idMeal.charCodeAt(0)) % 997
        - ((dayKey * 2654435761) ^ b.idMeal.charCodeAt(0)) % 997,
    );
    return shuffled.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Fetch full details for a single meal (called when user taps a Discover card).
 */
export async function getMealDetail(idMeal: string): Promise<MealDetail | null> {
  try {
    const res = await fetchWithTimeout(`${BASE}/lookup.php?i=${idMeal}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { meals: MealDetail[] | null };
    return data.meals?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Convert a TheMealDB MealDetail into RecipeSnap import payload.
 */
export function mealToImportPayload(meal: MealDetail): {
  title: string;
  description: string;
  cuisine: string;
  servings: number;
  ingredients: Array<{ item: string; quantity: string }>;
  steps: string[];
  sourceUrl: string;
  tags: string[];
  thumbnailUrl: string;
} {
  // Parse ingredients (strIngredient1..20 + strMeasure1..20)
  const ingredients: Array<{ item: string; quantity: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const item = meal[`strIngredient${i}`]?.trim();
    const qty = meal[`strMeasure${i}`]?.trim();
    if (item) ingredients.push({ item, quantity: qty || '' });
  }

  // Parse steps from instructions — split by double newline or numbered list
  const rawInstructions = meal.strInstructions ?? '';
  const steps = rawInstructions
    .split(/\r?\n\r?\n|\r?\n(?=\d+[\.\)]?\s)/)
    .map((s) => s.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((s) => s.length > 10);

  return {
    title: meal.strMeal,
    description: `${meal.strArea} ${meal.strCategory}`.trim(),
    cuisine: meal.strArea || meal.strCategory,
    servings: 4,
    ingredients,
    steps: steps.length > 0 ? steps : [rawInstructions.trim()],
    sourceUrl: meal.strYoutube || '',
    tags: [meal.strCategory, meal.strArea].filter(Boolean),
    thumbnailUrl: meal.strMealThumb,
  };
}
