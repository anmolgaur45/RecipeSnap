import { create } from 'zustand';
import type { GroceryList, GroceryListItem } from './types';
import {
  createGroceryList,
  getGroceryLists,
  getGroceryList,
  updateGroceryItem,
  addGroceryItem,
  deleteGroceryItem,
  archiveGroceryList,
  getShareText,
  deleteGroceryList,
  type CreateListParams,
} from '@/services/grocery';

interface GroceryState {
  lists: GroceryList[];
  activeList: GroceryList | null;  // most recent isActive list with full items
  isLoading: boolean;
  error: string | null;

  fetchLists: () => Promise<void>;
  loadList: (id: number) => Promise<void>;
  createList: (params: CreateListParams) => Promise<GroceryList>;
  toggleItem: (listId: number, itemId: number, currentChecked: boolean) => Promise<void>;
  addItem: (listId: number, text: string) => Promise<void>;
  deleteItem: (listId: number, itemId: number) => Promise<void>;
  archiveList: (listId: number) => Promise<void>;
  shareText: (listId: number) => Promise<string>;
  removeList: (listId: number) => Promise<void>;
  clearError: () => void;
}

export const useGroceryStore = create<GroceryState>((set, get) => ({
  lists: [],
  activeList: null,
  isLoading: false,
  error: null,

  fetchLists: async () => {
    set({ isLoading: true, error: null });
    try {
      const lists = await getGroceryLists();
      set({ lists, isLoading: false });

      // Auto-load the most recent active list with full items
      const firstActive = lists.find((l) => l.isActive);
      if (firstActive) {
        const full = await getGroceryList(firstActive.id);
        set({ activeList: full });
      } else {
        set({ activeList: null });
      }
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  loadList: async (id: number) => {
    set({ isLoading: true });
    try {
      const full = await getGroceryList(id);
      set({ activeList: full, isLoading: false });
      // Keep summary list up-to-date
      set((s) => ({
        lists: s.lists.map((l) =>
          l.id === id ? { ...l, progress: full.progress } : l
        ),
      }));
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  createList: async (params: CreateListParams) => {
    set({ isLoading: true, error: null });
    try {
      const newList = await createGroceryList(params);
      set((s) => ({
        lists: [newList, ...s.lists],
        activeList: newList,
        isLoading: false,
      }));
      return newList;
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
      throw e;
    }
  },

  toggleItem: async (listId: number, itemId: number, currentChecked: boolean) => {
    // Optimistic update
    const updateItems = (items: GroceryListItem[] | undefined) =>
      items?.map((i) => (i.id === itemId ? { ...i, isChecked: !currentChecked } : i));

    set((s) => ({
      activeList: s.activeList?.id === listId
        ? {
            ...s.activeList,
            items: updateItems(s.activeList.items),
            aisles: s.activeList.aisles?.map((a) => ({
              ...a,
              items: updateItems(a.items) ?? a.items,
            })),
            progress: s.activeList.progress
              ? {
                  ...s.activeList.progress,
                  checked: !currentChecked
                    ? s.activeList.progress.checked + 1
                    : s.activeList.progress.checked - 1,
                }
              : undefined,
          }
        : s.activeList,
    }));

    try {
      await updateGroceryItem(listId, itemId, { isChecked: !currentChecked });
    } catch (_e) {
      // Revert on failure
      set((s) => ({
        activeList: s.activeList?.id === listId
          ? {
              ...s.activeList,
              items: updateItems(s.activeList.items), // toggle back
              aisles: s.activeList.aisles?.map((a) => ({
                ...a,
                items: updateItems(a.items) ?? a.items,
              })),
            }
          : s.activeList,
      }));
    }
  },

  addItem: async (listId: number, text: string) => {
    const item = await addGroceryItem(listId, text);
    set((s) => {
      if (s.activeList?.id !== listId) return s;
      const newItems = [...(s.activeList.items ?? []), item];
      return {
        activeList: {
          ...s.activeList,
          items: newItems,
          progress: { checked: s.activeList.progress?.checked ?? 0, total: newItems.length },
        },
      };
    });
  },

  deleteItem: async (listId: number, itemId: number) => {
    // Optimistic
    set((s) => {
      if (s.activeList?.id !== listId) return s;
      const newItems = s.activeList.items?.filter((i) => i.id !== itemId) ?? [];
      const checked = newItems.filter((i) => i.isChecked).length;
      return {
        activeList: {
          ...s.activeList,
          items: newItems,
          aisles: s.activeList.aisles?.map((a) => ({
            ...a,
            items: a.items.filter((i) => i.id !== itemId),
          })).filter((a) => a.items.length > 0),
          progress: { checked, total: newItems.length },
        },
      };
    });
    await deleteGroceryItem(listId, itemId);
  },

  archiveList: async (listId: number) => {
    await archiveGroceryList(listId);
    set((s) => ({
      lists: s.lists.map((l) => (l.id === listId ? { ...l, isActive: false } : l)),
      activeList: s.activeList?.id === listId
        ? null
        : s.activeList,
    }));
    // Load next active list if any
    const next = get().lists.find((l) => l.isActive && l.id !== listId);
    if (next) {
      await get().loadList(next.id);
    }
  },

  shareText: async (listId: number) => {
    return getShareText(listId);
  },

  removeList: async (listId: number) => {
    await deleteGroceryList(listId);
    set((s) => ({
      lists: s.lists.filter((l) => l.id !== listId),
      activeList: s.activeList?.id === listId ? null : s.activeList,
    }));
  },

  clearError: () => set({ error: null }),
}));
