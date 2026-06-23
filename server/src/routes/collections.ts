import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { collections, recipeCollections, recipes } from '../db/schema.pg';
import { requireAuth } from '../middleware/auth';

export const collectionsRouter = Router();

// forward async errors to the express error handler
const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

collectionsRouter.use(requireAuth);

/** GET /api/collections - list this user's collections with recipe count + IDs */
collectionsRouter.get(
  '/',
  ah(async (req, res) => {
    const userId = req.userId!;
    const rows = await db
      .select({
        id: collections.id,
        name: collections.name,
        emoji: collections.emoji,
        createdAt: collections.createdAt,
        recipeCount: sql<number>`count(${recipeCollections.recipeId})`.mapWith(Number),
        recipeIds: sql<string[]>`coalesce(array_agg(${recipeCollections.recipeId}) filter (where ${recipeCollections.recipeId} is not null), '{}'::uuid[])`,
      })
      .from(collections)
      .leftJoin(recipeCollections, eq(recipeCollections.collectionId, collections.id))
      .where(eq(collections.userId, userId))
      .groupBy(collections.id)
      .orderBy(asc(collections.name));
    res.json(rows);
  }),
);

/** POST /api/collections - create a collection */
collectionsRouter.post(
  '/',
  ah(async (req, res) => {
    const userId = req.userId!;
    const { name, emoji } = req.body as { name?: string; emoji?: string };
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const [row] = await db
      .insert(collections)
      .values({ userId, name: name.trim(), emoji: emoji ?? null })
      .returning();
    res.status(201).json({ ...row, recipeCount: 0, recipeIds: [] });
  }),
);

/** POST /api/collections/:id/recipes - add one of this user's recipes to their collection */
collectionsRouter.post(
  '/:id/recipes',
  ah(async (req, res) => {
    const userId = req.userId!;
    const collectionId = Number(req.params.id);
    const { recipeId } = req.body as { recipeId?: string };
    if (!Number.isInteger(collectionId)) {
      res.status(400).json({ error: 'invalid collection id' });
      return;
    }
    if (!recipeId) {
      res.status(400).json({ error: 'recipeId is required' });
      return;
    }
    const owned = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);
    if (owned.length === 0) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    const recipe = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
      .limit(1);
    if (recipe.length === 0) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    await db.insert(recipeCollections).values({ recipeId, collectionId }).onConflictDoNothing();
    res.status(204).end();
  }),
);

/** DELETE /api/collections/:id/recipes/:recipeId - remove a recipe from this user's collection */
collectionsRouter.delete(
  '/:id/recipes/:recipeId',
  ah(async (req, res) => {
    const userId = req.userId!;
    const collectionId = Number(req.params.id);
    if (!Number.isInteger(collectionId)) {
      res.status(400).json({ error: 'invalid collection id' });
      return;
    }
    const owned = await db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);
    if (owned.length === 0) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    await db
      .delete(recipeCollections)
      .where(
        and(
          eq(recipeCollections.collectionId, collectionId),
          eq(recipeCollections.recipeId, req.params.recipeId),
        ),
      );
    res.status(204).end();
  }),
);

/** DELETE /api/collections/:id - delete this user's collection */
collectionsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const userId = req.userId!;
    const collectionId = Number(req.params.id);
    if (!Number.isInteger(collectionId)) {
      res.status(400).json({ error: 'invalid collection id' });
      return;
    }
    const deleted = await db
      .delete(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .returning({ id: collections.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.status(204).end();
  }),
);
