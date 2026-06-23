import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, asc, count, desc, eq, notExists, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { recipeTags, recipes } from '../db/schema.pg';
import { tagRecipe } from '../services/autoTagger';
import { requireAuth } from '../middleware/auth';

export const tagsRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

tagsRouter.use(requireAuth);

/** GET /api/tags — this user's recipe tags grouped by type, most common first. */
tagsRouter.get(
  '/',
  ah(async (req, res) => {
    const rows = await db
      .select({ type: recipeTags.type, tag: recipeTags.tag, cnt: count() })
      .from(recipeTags)
      .innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
      .where(eq(recipes.userId, req.userId!))
      .groupBy(recipeTags.type, recipeTags.tag)
      .orderBy(asc(recipeTags.type), desc(count()));

    const grouped: Record<string, string[]> = {};
    for (const row of rows) {
      (grouped[row.type] ??= []).push(row.tag);
    }
    res.json(grouped);
  }),
);

/** POST /api/tags/backfill — tag this user's recipes that have no tags yet. */
tagsRouter.post(
  '/backfill',
  ah(async (req, res) => {
    const untagged = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          eq(recipes.userId, req.userId!),
          notExists(db.select({ x: sql`1` }).from(recipeTags).where(eq(recipeTags.recipeId, recipes.id))),
        ),
      );
    const ids = untagged.map((r) => r.id);
    res.json({ queued: ids.length, recipeIds: ids });

    for (const id of ids) {
      await tagRecipe(id).catch((e: unknown) => console.warn(`[backfill] failed for ${id}:`, e));
    }
  }),
);
