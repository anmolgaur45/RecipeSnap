import { API_URL } from '@/constants/config';
import type { GroceryList, GroceryListItem } from '@/store/types';

const BASE = `${API_URL}/api/grocery-lists`;

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

export interface CreateListParams {
  recipeIds: string[];
  name?: string;
  subtractPantry?: boolean;
}

/** Create a new grocery list from one or more recipe IDs */
export function createGroceryList(params: CreateListParams): Promise<GroceryList> {
  return request<GroceryList>('/', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/** Get all grocery lists (summary — no items) */
export function getGroceryLists(): Promise<GroceryList[]> {
  return request<GroceryList[]>('/');
}

/** Get a specific list with full item detail + aisle grouping */
export function getGroceryList(id: number): Promise<GroceryList> {
  return request<GroceryList>(`/${id}`);
}

/** Toggle isChecked state or update quantity on an item */
export function updateGroceryItem(
  listId: number,
  itemId: number,
  patch: { isChecked?: boolean; quantity?: string; unit?: string; numericQuantity?: number | null }
): Promise<GroceryListItem> {
  return request<GroceryListItem>(`/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** Manually add an item by text (parsed server-side) */
export function addGroceryItem(listId: number, text: string): Promise<GroceryListItem> {
  return request<GroceryListItem>(`/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

/** Delete an item from a list */
export function deleteGroceryItem(listId: number, itemId: number): Promise<void> {
  return request<void>(`/${listId}/items/${itemId}`, { method: 'DELETE' });
}

/** Archive a completed list */
export function archiveGroceryList(listId: number): Promise<GroceryList> {
  return request<GroceryList>(`/${listId}/archive`, { method: 'PATCH' });
}

/** Get shareable plain-text for a list */
export function getShareText(listId: number): Promise<string> {
  return request<{ text: string }>(`/${listId}/share`, { method: 'POST' }).then(
    (r) => r.text
  );
}

/** Delete an entire grocery list */
export function deleteGroceryList(listId: number): Promise<void> {
  return request<void>(`/${listId}`, { method: 'DELETE' });
}
