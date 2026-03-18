import { Router, Request, Response } from 'express';
import { db } from '../db/schema';

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
