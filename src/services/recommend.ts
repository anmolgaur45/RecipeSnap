import { API_URL } from '@/constants/config';

export interface IngredientMatch {
  ingredient: string;
  matched: boolean;
  pantryItemId?: number;
  pantryItemName?: string;
  isExpiring?: boolean;
}

export type MatchCategory = 'ready' | 'almost' | 'needs_shopping';

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

export async function getPantryMatches(params?: {
  limit?: number;
  minMatch?: number;
  prioritizeExpiring?: boolean;
}): Promise<RecipeRecommendation[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.minMatch !== undefined) query.set('minMatch', String(params.minMatch));
  if (params?.prioritizeExpiring !== undefined)
    query.set('prioritizeExpiring', String(params.prioritizeExpiring));
  const res = await fetch(`${API_URL}/api/recommendations/pantry-match?${query}`);
  if (!res.ok) throw new Error('Failed to fetch pantry matches');
  return res.json() as Promise<RecipeRecommendation[]>;
}

export async function getAISuggestions(
  prioritizeExpiring?: boolean
): Promise<AISuggestedRecipe[]> {
  const res = await fetch(`${API_URL}/api/recommendations/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prioritizeExpiring }),
  });
  if (!res.ok) throw new Error('Failed to get AI suggestions');
  return res.json() as Promise<AISuggestedRecipe[]>;
}

export async function getExpiringAlerts(): Promise<ExpiringAlert[]> {
  const res = await fetch(`${API_URL}/api/recommendations/expiring-alerts`);
  if (!res.ok) throw new Error('Failed to fetch expiring alerts');
  return res.json() as Promise<ExpiringAlert[]>;
}
