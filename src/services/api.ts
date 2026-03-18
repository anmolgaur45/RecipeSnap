import { API_URL } from '@/constants/config';
import { AdaptationResult, Collection, ExtractionResult, Ingredient, ProcessingStage, Recipe, SubstitutionReason, SubstitutionResult, TagGroup } from '@/store/types';

const POLL_INTERVAL_MS = 2000;

export async function extractRecipeFromUrl(
  url: string,
  onProgress?: (stage: ProcessingStage, message: string) => void
): Promise<ExtractionResult> {
  // 1. Enqueue job — returns immediately with a jobId
  const startRes = await fetch(`${API_URL}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(err.message ?? `Server error: ${startRes.status}`);
  }

  const { jobId } = await startRes.json() as { jobId: string };

  // 2. Poll until done or error
  let lastProgressCount = 0;
  while (true) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${API_URL}/api/extract/jobs/${jobId}`);
    if (!pollRes.ok) throw new Error(`Poll failed: ${pollRes.status}`);

    const job = await pollRes.json() as {
      status: 'queued' | 'processing' | 'done' | 'error';
      progress: { stage: string; message: string; ts: number }[];
      result: ExtractionResult | null;
      error: string | null;
    };

    // Emit any new progress events
    const newEvents = job.progress.slice(lastProgressCount);
    for (const ev of newEvents) {
      onProgress?.(ev.stage as ProcessingStage, ev.message);
    }
    lastProgressCount = job.progress.length;

    if (job.status === 'done') {
      if (!job.result) throw new Error('Job completed but no result returned');
      return job.result;
    }
    if (job.status === 'error') {
      throw new Error(job.error ?? 'Extraction failed');
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getRecipes() {
  const response = await fetch(`${API_URL}/api/recipes`);
  if (!response.ok) throw new Error('Failed to fetch recipes');
  return response.json();
}

export async function deleteRecipeFromServer(id: string) {
  const response = await fetch(`${API_URL}/api/recipes/${id}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete recipe');
}

/** Return scaled ingredients for a recipe without saving to DB */
export async function scaleRecipe(id: string, targetServings: number): Promise<Ingredient[]> {
  const response = await fetch(`${API_URL}/api/recipes/${id}/scale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetServings }),
  });
  if (!response.ok) throw new Error('Failed to scale recipe');
  const data = await response.json() as { ingredients: Ingredient[] };
  return data.ingredients;
}

/** Permanently update a recipe's default serving size and all stored quantities */
export async function updateServings(id: string, servings: number): Promise<Recipe> {
  const response = await fetch(`${API_URL}/api/recipes/${id}/servings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servings }),
  });
  if (!response.ok) throw new Error('Failed to update servings');
  return response.json() as Promise<Recipe>;
}

/** Calculate (or recalculate) per-serving nutrition — returns the full updated recipe */
export async function calculateNutritionApi(id: string): Promise<Recipe> {
  const response = await fetch(`${API_URL}/api/recipes/${id}/nutrition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Nutrition calculation failed' })) as { error?: string };
    throw new Error(err.error ?? `Server error: ${response.status}`);
  }
  return response.json() as Promise<Recipe>;
}

/** Suggest AI-powered substitutions for a single ingredient */
export async function getSubstitutions(
  recipeId: string,
  ingredientId: string,
  reason: SubstitutionReason = 'dietary',
): Promise<SubstitutionResult> {
  const response = await fetch(`${API_URL}/api/recipes/${recipeId}/substitute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredientId, reason }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Substitution failed' })) as { error?: string };
    throw new Error(err.error ?? `Server error: ${response.status}`);
  }
  return response.json() as Promise<SubstitutionResult>;
}

// ── Search & filter ───────────────────────────────────────────────────────────

export interface SearchParams {
  q?: string;
  cuisine?: string;
  diet?: string;
  difficulty?: string;
  method?: string;
  time?: string;
  category?: string;
  collectionId?: number;
  sort?: 'recent' | 'alpha';
}

export async function searchRecipes(params: SearchParams): Promise<Recipe[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const response = await fetch(`${API_URL}/api/recipes/search?${qs.toString()}`);
  if (!response.ok) throw new Error('Search failed');
  return response.json() as Promise<Recipe[]>;
}

export async function getTagGroups(): Promise<TagGroup> {
  const response = await fetch(`${API_URL}/api/tags`);
  if (!response.ok) throw new Error('Failed to fetch tags');
  return response.json() as Promise<TagGroup>;
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function getCollections(): Promise<Collection[]> {
  const response = await fetch(`${API_URL}/api/collections`);
  if (!response.ok) throw new Error('Failed to fetch collections');
  return response.json() as Promise<Collection[]>;
}

export async function createCollection(name: string, emoji?: string): Promise<Collection> {
  const response = await fetch(`${API_URL}/api/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, emoji }),
  });
  if (!response.ok) throw new Error('Failed to create collection');
  return response.json() as Promise<Collection>;
}

export async function addToCollection(collectionId: number, recipeId: string): Promise<void> {
  await fetch(`${API_URL}/api/collections/${collectionId}/recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipeId }),
  });
}

export async function removeFromCollection(collectionId: number, recipeId: string): Promise<void> {
  await fetch(`${API_URL}/api/collections/${collectionId}/recipes/${recipeId}`, {
    method: 'DELETE',
  });
}

/** AI-adapt a recipe (vegan, gluten-free, keto, etc.) and save as a new recipe */
export async function adaptRecipeApi(
  id: string,
  type: string,
  customPrompt?: string,
): Promise<AdaptationResult> {
  const response = await fetch(`${API_URL}/api/recipes/${id}/adapt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, customPrompt }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Adaptation failed' })) as { error?: string };
    throw new Error(err.error ?? `Server error: ${response.status}`);
  }
  return response.json() as Promise<AdaptationResult>;
}
