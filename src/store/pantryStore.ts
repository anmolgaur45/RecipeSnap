import { create } from 'zustand';
import type { PantryItem } from './types';
import {
  getPantryItems,
  addPantryItem,
  updatePantryItem,
  deletePantryItem,
  quickAddPantryItems,
  bulkAddFromGroceryList,
  setupPantryStaples,
} from '@/services/pantry';

interface PantryState {
  items: PantryItem[];
  isLoading: boolean;
  error: string | null;

  fetchPantry: () => Promise<void>;
  addItem: (params: {
    name: string;
    displayName?: string;
    quantity?: number | null;
    unit?: string | null;
    category?: string | null;
    expiresAt?: string | null;
    isStaple?: boolean;
    notes?: string | null;
  }) => Promise<PantryItem>;
  updateItem: (id: number, updates: Partial<Omit<PantryItem, 'id' | 'addedAt' | 'expiryStatus'>>) => Promise<void>;
  deleteItem: (id: number, force?: boolean) => Promise<void>;
  quickAdd: (text: string) => Promise<PantryItem[]>;
  bulkAddFromList: (groceryListId: number) => Promise<PantryItem[]>;
  setupStaples: (stapleNames: string[]) => Promise<PantryItem[]>;
  getExpiringItems: () => PantryItem[];
  clearError: () => void;
}

export const usePantryStore = create<PantryState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchPantry: async () => {
    set({ isLoading: true, error: null });
    try {
      const items = await getPantryItems();
      set({ items, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  addItem: async (params) => {
    const item = await addPantryItem(params);
    set((s) => {
      // Merge or add
      const exists = s.items.find((i) => i.id === item.id);
      if (exists) {
        return { items: s.items.map((i) => (i.id === item.id ? item : i)) };
      }
      return { items: [...s.items, item] };
    });
    return item;
  },

  updateItem: async (id, updates) => {
    const updated = await updatePantryItem(id, updates);
    set((s) => ({ items: s.items.map((i) => (i.id === id ? updated : i)) }));
  },

  deleteItem: async (id, force = false) => {
    // Optimistic remove
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    try {
      await deletePantryItem(id, force);
    } catch (e) {
      // Revert: refetch
      const items = await getPantryItems();
      set({ items, error: (e as Error).message });
    }
  },

  quickAdd: async (text) => {
    set({ isLoading: true, error: null });
    try {
      const newItems = await quickAddPantryItems(text);
      set((s) => {
        const merged = [...s.items];
        for (const item of newItems) {
          const idx = merged.findIndex((i) => i.id === item.id);
          if (idx >= 0) merged[idx] = item;
          else merged.push(item);
        }
        return { items: merged, isLoading: false };
      });
      return newItems;
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  bulkAddFromList: async (groceryListId) => {
    const newItems = await bulkAddFromGroceryList(groceryListId);
    set((s) => {
      const merged = [...s.items];
      for (const item of newItems) {
        const idx = merged.findIndex((i) => i.id === item.id);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      return { items: merged };
    });
    return newItems;
  },

  setupStaples: async (stapleNames) => {
    const newItems = await setupPantryStaples(stapleNames);
    set((s) => {
      const merged = [...s.items];
      for (const item of newItems) {
        const idx = merged.findIndex((i) => i.id === item.id);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
      }
      return { items: merged };
    });
    return newItems;
  },

  getExpiringItems: () => {
    return get().items.filter(
      (i) => i.expiryStatus === 'expiring_soon' || i.expiryStatus === 'expired'
    );
  },

  clearError: () => set({ error: null }),
}));
