import { create } from 'zustand';
import { startCookSession, completeCookSession } from '@/services/cook';
import { depletePantryFromRecipe } from '@/services/pantry';

interface CookState {
  sessionId: number | null;
  recipeId: string | null;
  servings: number;
  currentStepIndex: number;
  totalSteps: number;
  isActive: boolean;

  startSession: (recipeId: string, servings: number, totalSteps: number) => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  completeSession: (rating: number, notes?: string) => Promise<void>;
  reset: () => void;
}

export const useCookStore = create<CookState>()((set, get) => ({
  sessionId: null,
  recipeId: null,
  servings: 2,
  currentStepIndex: 0,
  totalSteps: 0,
  isActive: false,

  startSession: async (recipeId, servings, totalSteps) => {
    const session = await startCookSession(recipeId, servings);
    set({
      sessionId: session.id,
      recipeId,
      servings,
      currentStepIndex: 0,
      totalSteps,
      isActive: true,
    });
  },

  nextStep: () => {
    const { currentStepIndex, totalSteps } = get();
    if (currentStepIndex < totalSteps - 1) {
      set({ currentStepIndex: currentStepIndex + 1 });
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      set({ currentStepIndex: currentStepIndex - 1 });
    }
  },

  completeSession: async (rating, notes) => {
    const { sessionId, recipeId, servings } = get();
    if (sessionId === null || recipeId === null) return;

    await completeCookSession(sessionId, rating, notes);
    await depletePantryFromRecipe(recipeId, servings).catch(() => {
      // Pantry depletion is best-effort — don't block on failure
    });
    get().reset();
  },

  reset: () => {
    set({
      sessionId: null,
      recipeId: null,
      servings: 2,
      currentStepIndex: 0,
      totalSteps: 0,
      isActive: false,
    });
  },
}));
