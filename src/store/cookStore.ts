// Cook Store — implemented in Phase 4
import { create } from 'zustand';

interface CookState {
  isActive: boolean;
}

export const useCookStore = create<CookState>()(() => ({
  isActive: false,
}));
