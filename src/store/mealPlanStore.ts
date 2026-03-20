import { create } from 'zustand';
import type { MealPlan, MealPlanEntry, NutritionGoal, MealSlot } from './types';
import {
  getActiveMealPlan,
  createMealPlan,
  addMealEntry,
  updateMealEntry,
  removeMealEntry,
  markEntryCooked,
  generateGroceryListFromPlan as apiGenerateGroceryList,
  getNutritionGoals,
  updateNutritionGoals,
} from '@/services/mealPlan';

interface MealPlanState {
  activePlan: MealPlan | null;
  nutritionGoals: NutritionGoal | null;
  isLoading: boolean;
  error: string | null;

  fetchActivePlan: () => Promise<void>;
  createPlan: (startDate: string, endDate: string, name?: string) => Promise<MealPlan>;
  addEntry: (
    planId: number,
    recipeId: string,
    date: string,
    mealSlot: MealSlot,
    servings: number
  ) => Promise<void>;
  removeEntry: (entryId: number) => Promise<void>;
  updateEntry: (
    entryId: number,
    updates: { date?: string; mealSlot?: MealSlot; servings?: number; notes?: string }
  ) => Promise<void>;
  markCooked: (entryId: number) => Promise<void>;
  generateGroceryListFromPlan: (
    planId: number
  ) => Promise<{ listId: number; itemCount: number }>;
  fetchGoals: () => Promise<void>;
  updateGoals: (updates: Partial<NutritionGoal>) => Promise<void>;
  clearError: () => void;
}

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  activePlan: null,
  nutritionGoals: null,
  isLoading: false,
  error: null,

  fetchActivePlan: async () => {
    set({ isLoading: true, error: null });
    try {
      const [plan, goals] = await Promise.all([getActiveMealPlan(), getNutritionGoals()]);
      set({ activePlan: plan, nutritionGoals: goals, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  createPlan: async (startDate, endDate, name) => {
    set({ isLoading: true, error: null });
    try {
      const plan = await createMealPlan(startDate, endDate, name);
      set({ activePlan: plan, isLoading: false });
      return plan;
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  addEntry: async (planId, recipeId, date, mealSlot, servings) => {
    try {
      const entry = await addMealEntry(planId, recipeId, date, mealSlot, servings);
      set((s) => {
        if (!s.activePlan || s.activePlan.id !== planId) return s;
        return {
          activePlan: {
            ...s.activePlan,
            entries: [...(s.activePlan.entries ?? []), entry],
          },
        };
      });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  removeEntry: async (entryId) => {
    // Optimistic remove
    set((s) => ({
      activePlan: s.activePlan
        ? {
            ...s.activePlan,
            entries: (s.activePlan.entries ?? []).filter((e) => e.id !== entryId),
          }
        : s.activePlan,
    }));
    try {
      await removeMealEntry(entryId);
    } catch (e) {
      // Revert by re-fetching
      await get().fetchActivePlan();
      throw e;
    }
  },

  updateEntry: async (entryId, updates) => {
    try {
      const updated = await updateMealEntry(entryId, updates);
      set((s) => ({
        activePlan: s.activePlan
          ? {
              ...s.activePlan,
              entries: (s.activePlan.entries ?? []).map((e) =>
                e.id === entryId ? updated : e
              ),
            }
          : s.activePlan,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  markCooked: async (entryId) => {
    try {
      const updated = await markEntryCooked(entryId);
      set((s) => ({
        activePlan: s.activePlan
          ? {
              ...s.activePlan,
              entries: (s.activePlan.entries ?? []).map((e) =>
                e.id === entryId ? updated : e
              ),
            }
          : s.activePlan,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  generateGroceryListFromPlan: async (planId) => {
    return apiGenerateGroceryList(planId);
  },

  fetchGoals: async () => {
    try {
      const goals = await getNutritionGoals();
      set({ nutritionGoals: goals });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateGoals: async (updates) => {
    try {
      const goals = await updateNutritionGoals(updates);
      set({ nutritionGoals: goals });
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
