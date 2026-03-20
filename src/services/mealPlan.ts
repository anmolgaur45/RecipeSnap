import { API_URL } from '@/constants/config';
import type { MealPlan, MealPlanEntry, NutritionGoal, DayNutrition, MealSlot } from '@/store/types';

const BASE = `${API_URL}/api/meal-plans`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Create a new meal plan */
export function createMealPlan(startDate: string, endDate: string, name?: string): Promise<MealPlan> {
  return request<MealPlan>('/', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, name }),
  });
}

/** Get the currently active meal plan — returns null if none exists */
export async function getActiveMealPlan(): Promise<MealPlan | null> {
  try {
    return await request<MealPlan>('/active');
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('404') || msg.toLowerCase().includes('no active')) return null;
    throw e;
  }
}

/** Add a recipe to a meal slot */
export function addMealEntry(
  planId: number,
  recipeId: string,
  date: string,
  mealSlot: MealSlot,
  servings: number
): Promise<MealPlanEntry> {
  return request<MealPlanEntry>(`/${planId}/entries`, {
    method: 'POST',
    body: JSON.stringify({ recipeId, date, mealSlot, servings }),
  });
}

/** Update a meal entry (date, slot, servings, notes) */
export function updateMealEntry(
  entryId: number,
  updates: { date?: string; mealSlot?: MealSlot; servings?: number; notes?: string }
): Promise<MealPlanEntry> {
  return request<MealPlanEntry>(`/entries/${entryId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** Remove a meal entry */
export function removeMealEntry(entryId: number): Promise<void> {
  return request<void>(`/entries/${entryId}`, { method: 'DELETE' });
}

/** Mark a meal entry as cooked (also depletes pantry) */
export function markEntryCooked(entryId: number): Promise<MealPlanEntry> {
  return request<MealPlanEntry>(`/entries/${entryId}/cooked`, { method: 'PATCH' });
}

/** Get nutrition totals for a specific day */
export function getDayNutrition(planId: number, date: string): Promise<DayNutrition> {
  return request<DayNutrition>(`/${planId}/nutrition/${date}`);
}

/** Get nutrition totals for all 7 days of the plan */
export function getWeekNutrition(planId: number): Promise<DayNutrition[]> {
  return request<DayNutrition[]>(`/${planId}/nutrition`);
}

/** Generate a consolidated grocery list from all plan entries (subtracts pantry) */
export function generateGroceryListFromPlan(
  planId: number
): Promise<{ listId: number; itemCount: number }> {
  return request<{ listId: number; itemCount: number }>(`/${planId}/grocery-list`, {
    method: 'POST',
  });
}

/** Get active nutrition goals */
export function getNutritionGoals(): Promise<NutritionGoal> {
  return request<NutritionGoal>('/goals');
}

/** Update nutrition goals */
export function updateNutritionGoals(updates: Partial<NutritionGoal>): Promise<NutritionGoal> {
  return request<NutritionGoal>('/goals', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** Duplicate all entries from sourceDate to targetDate within a plan */
export function duplicatePlanDay(
  planId: number,
  sourceDate: string,
  targetDate: string
): Promise<MealPlanEntry[]> {
  return request<MealPlanEntry[]>(`/${planId}/duplicate-day`, {
    method: 'POST',
    body: JSON.stringify({ sourceDate, targetDate }),
  });
}
