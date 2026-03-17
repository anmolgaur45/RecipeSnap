import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recipe, ProcessingStatus, ProcessingStage } from './types';
import { extractRecipeFromUrl, getRecipes, deleteRecipeFromServer } from '@/services/api';

interface RecipeState {
  recipes: Recipe[];
  currentRecipe: Recipe | null;
  isProcessing: boolean;
  isSyncing: boolean;
  processingStatus: ProcessingStatus;
  error: string | null;
}

interface RecipeActions {
  extractRecipe: (url: string) => Promise<Recipe | null>;
  saveRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => Promise<void>;
  syncRecipes: () => Promise<void>;
  setCurrentRecipe: (recipe: Recipe | null) => void;
  clearError: () => void;
}

const defaultProcessingStatus: ProcessingStatus = {
  stage: 'idle',
  message: '',
  completedSteps: [],
  failedSteps: [],
};

export const useRecipeStore = create<RecipeState & RecipeActions>()(
  persist(
    (set, get) => ({
      recipes: [],
      currentRecipe: null,
      isProcessing: false,
      isSyncing: false,
      processingStatus: defaultProcessingStatus,
      error: null,

      extractRecipe: async (url: string) => {
        set({
          isProcessing: true,
          error: null,
          processingStatus: {
            stage: 'resolving',
            message: 'Resolving video URL...',
            completedSteps: [],
            failedSteps: [],
          },
        });

        try {
          const onProgress = (stage: ProcessingStage, message: string) => {
            set((state) => ({
              processingStatus: {
                stage,
                message,
                completedSteps: [
                  ...state.processingStatus.completedSteps,
                  state.processingStatus.stage,
                ].filter((s) => s !== 'idle'),
                failedSteps: state.processingStatus.failedSteps,
              },
            }));
          };

          const result = await extractRecipeFromUrl(url, onProgress);

          set((state) => ({
            isProcessing: false,
            currentRecipe: result.recipe,
            recipes: [
              result.recipe,
              ...state.recipes.filter((r) => r.id !== result.recipe.id),
            ],
            processingStatus: {
              stage: 'complete',
              message: 'Recipe extracted!',
              completedSteps: [...state.processingStatus.completedSteps, 'structuring'],
              failedSteps: state.processingStatus.failedSteps,
            },
          }));

          return result.recipe;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Extraction failed';
          set({
            isProcessing: false,
            error: message,
            processingStatus: {
              stage: 'error',
              message,
              completedSteps: get().processingStatus.completedSteps,
              failedSteps: [...get().processingStatus.failedSteps, get().processingStatus.stage],
            },
          });
          return null;
        }
      },

      saveRecipe: (recipe: Recipe) => {
        set((state) => ({
          recipes: [recipe, ...state.recipes.filter((r) => r.id !== recipe.id)],
        }));
      },

      deleteRecipe: async (id: string) => {
        // Optimistic update — remove locally first for instant UI feedback
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
          currentRecipe: state.currentRecipe?.id === id ? null : state.currentRecipe,
        }));
        // Best-effort server sync — ignore errors (local delete already applied)
        deleteRecipeFromServer(id).catch(() => {});
      },

      syncRecipes: async () => {
        set({ isSyncing: true });
        try {
          const serverRecipes: Recipe[] = await getRecipes();
          set({ recipes: serverRecipes });
        } catch {
          // Offline or server unavailable — keep local recipes as-is
        } finally {
          set({ isSyncing: false });
        }
      },

      setCurrentRecipe: (recipe: Recipe | null) => {
        set({ currentRecipe: recipe });
      },

      clearError: () => {
        set({ error: null, processingStatus: defaultProcessingStatus });
      },
    }),
    {
      name: 'recipesnap-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ recipes: state.recipes }),
      skipHydration: true,
    }
  )
);
