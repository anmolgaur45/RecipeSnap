import path from 'path';
import fs from 'fs';
import type { SupabaseClient } from '@supabase/supabase-js';

// Local dev fallback location (mirrors the static mount in index.ts).
const THUMBNAILS_DIR = path.resolve(process.env.THUMBNAILS_DIR ?? './data/thumbnails');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'thumbnails';

let cachedClient: SupabaseClient | null = null;

async function getStorageClient(): Promise<SupabaseClient | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cachedClient) {
    const { createClient } = await import('@supabase/supabase-js');
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cachedClient;
}

/**
 * Persists an extracted keyframe so it outlives the temp dir.
 *
 * Prod: uploads to a public Supabase Storage bucket and returns the public URL.
 * The bucket holds non-sensitive food keyframes derived from public videos, so
 * a public object URL is used rather than per-request signed URLs (no expiry to
 * re-sign on every recipe fetch).
 *
 * Dev: copies into a local dir served at /thumbnails by Express.
 *
 * Returns the stored URL, or null if persistence failed (recipe still saves).
 */
export async function persistThumbnail(localPath: string, recipeId: string): Promise<string | null> {
  try {
    const supabase = await getStorageClient();
    const objectPath = `${recipeId}.jpg`;

    if (supabase) {
      const bytes = fs.readFileSync(localPath);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
    }

    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    fs.copyFileSync(localPath, path.join(THUMBNAILS_DIR, objectPath));
    return `/thumbnails/${objectPath}`;
  } catch {
    return null; // non-fatal
  }
}
