import { Router, Request, Response } from 'express';
import { db } from '../db/schema';
import { tagRecipe } from '../services/autoTagger';

export const tagsRouter = Router();

/**
 * GET /api/tags — return all recipe tags grouped by type.
 * Only types that have at least one tag are included.
 * Tags within each type are sorted by frequency (most common first).
 *
 * Response: { cuisine?: string[], diet?: string[], method?: string[], time?: string[], category?: string[], custom?: string[] }
 */
tagsRouter.get('/', (_req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT type, tag, COUNT(*) as cnt
       FROM recipe_tags
       GROUP BY type, tag
       ORDER BY type ASC, cnt DESC`,
    )
    .all() as Array<{ type: string; tag: string; cnt: number }>;

  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    if (!grouped[row.type]) grouped[row.type] = [];
    grouped[row.type].push(row.tag);
  }

  res.json(grouped);
});

/**
 * POST /api/tags/backfill — tag all recipes that have no tags yet.
 * Useful for seeding tags on existing recipes without re-extraction.
 * Runs async; returns immediately with a list of recipe IDs being processed.
 */
tagsRouter.post('/backfill', async (_req: Request, res: Response) => {
  const untagged = db
    .prepare(
      `SELECT DISTINCT r.id FROM recipes r
       WHERE NOT EXISTS (SELECT 1 FROM recipe_tags rt WHERE rt.recipeId = r.id)`,
    )
    .all() as Array<{ id: string }>;

  const ids = untagged.map((r) => r.id);
  res.json({ queued: ids.length, recipeIds: ids });

  // Run tagging in background after response is sent
  for (const { id } of untagged) {
    await tagRecipe(id).catch((e: unknown) => {
      console.warn(`[backfill] failed for ${id}:`, e);
    });
  }
});
