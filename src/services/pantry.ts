import { API_URL } from '@/constants/config';
import type { PantryItem } from '@/store/types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? `Server error: ${res.status}`);
  }
  return res;
}

export async function getPantryItems(): Promise<PantryItem[]> {
  const res = await apiFetch(`${API_URL}/api/pantry`);
  return res.json();
}

export async function getExpiringPantryItems(): Promise<PantryItem[]> {
  const res = await apiFetch(`${API_URL}/api/pantry/expiring`);
  return res.json();
}

export async function addPantryItem(params: {
  name: string;
  displayName?: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  expiresAt?: string | null;
  isStaple?: boolean;
  notes?: string | null;
}): Promise<PantryItem> {
  const res = await apiFetch(`${API_URL}/api/pantry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function quickAddPantryItems(text: string): Promise<PantryItem[]> {
  const res = await apiFetch(`${API_URL}/api/pantry/quick-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function bulkAddFromGroceryList(groceryListId: number): Promise<PantryItem[]> {
  const res = await apiFetch(`${API_URL}/api/pantry/bulk-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groceryListId }),
  });
  return res.json();
}

export async function setupPantryStaples(stapleNames: string[]): Promise<PantryItem[]> {
  const res = await apiFetch(`${API_URL}/api/pantry/setup-staples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stapleNames }),
  });
  return res.json();
}

export async function updatePantryItem(
  id: number,
  updates: Partial<Omit<PantryItem, 'id' | 'addedAt' | 'expiryStatus'>>
): Promise<PantryItem> {
  const res = await apiFetch(`${API_URL}/api/pantry/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deletePantryItem(id: number, force = false): Promise<void> {
  await apiFetch(`${API_URL}/api/pantry/${id}?force=${force}`, { method: 'DELETE' });
}

export async function depletePantryFromRecipe(recipeId: string, servings: number): Promise<void> {
  await apiFetch(`${API_URL}/api/pantry/deplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId, servings }),
  });
}
