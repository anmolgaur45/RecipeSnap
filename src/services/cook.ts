import { API_URL } from '@/constants/config';
import type { CookSession } from '@/store/types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? `Server error: ${res.status}`);
  }
  return res;
}

export async function startCookSession(
  recipeId: string,
  servings: number,
): Promise<CookSession> {
  const res = await apiFetch(`${API_URL}/api/cook/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId, servings }),
  });
  return res.json();
}

export async function completeCookSession(
  id: number,
  rating: number,
  notes?: string,
): Promise<CookSession> {
  const res = await apiFetch(`${API_URL}/api/cook/sessions/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, notes }),
  });
  return res.json();
}
