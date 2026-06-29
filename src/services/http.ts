import { API_URL } from '@/constants/config';
import { getAccessToken } from '@/services/supabase';

/**
 * fetch wrapper that injects the Supabase bearer token on every request.
 * Accepts a full URL (http...) or an API-relative path (/api/...).
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = input.startsWith('http') ? input : `${API_URL}${input}`;
  return fetch(url, { ...init, headers });
}
