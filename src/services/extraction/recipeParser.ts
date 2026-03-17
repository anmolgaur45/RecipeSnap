// Recipe structuring is handled server-side via Claude / Gemini APIs.
// This module is a client-side placeholder for type consistency.

import { Recipe } from '@/store/types';

export interface ParseInput {
  captionText: string;
  subtitleText: string;
  transcript: string;
  ocrText: string;
}

// No-op on client — actual parsing runs on the Express server.
export async function parseRecipeFromText(_input: ParseInput): Promise<Recipe> {
  throw new Error('Recipe parsing must be called via the backend API.');
}
