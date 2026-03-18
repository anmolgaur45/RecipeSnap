import { Router, Request, Response } from 'express';
import { db, DbCollection } from '../db/schema';

export const collectionsRouter = Router();

/** GET /api/collections — list all collections with recipe count + IDs */
collectionsRouter.get('/', (_req: Request, res: Response) => {
  const rows = db
    .prepare(`
      SELECT c.id, c.name, c.emoji, c.createdAt,
             COUNT(rc.recipeId) as recipeCount,
             COALESCE(GROUP_CONCAT(rc.recipeId), '') as recipeIdsStr
      FROM collections c
      LEFT JOIN recipe_collections rc ON rc.collectionId = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `)
    .all() as Array<DbCollection & { recipeCount: number; recipeIdsStr: string }>;

  const collections = rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    createdAt: r.createdAt,
    recipeCount: r.recipeCount,
    recipeIds: r.recipeIdsStr ? r.recipeIdsStr.split(',') : [],
  }));

  res.json(collections);
});

/** POST /api/collections — create a collection */
collectionsRouter.post('/', (req: Request, res: Response) => {
  const { name, emoji } = req.body as { name?: string; emoji?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = db
    .prepare('INSERT INTO collections (name, emoji) VALUES (?, ?)')
    .run(name.trim(), emoji ?? null);
  const collection = db
    .prepare('SELECT * FROM collections WHERE id = ?')
    .get(result.lastInsertRowid) as DbCollection;
  res.status(201).json({ ...collection, recipeCount: 0, recipeIds: [] });
});

/** POST /api/collections/:id/recipes — add a recipe to a collection */
collectionsRouter.post('/:id/recipes', (req: Request, res: Response) => {
  const { recipeId } = req.body as { recipeId?: string };
  if (!recipeId) {
    res.status(400).json({ error: 'recipeId is required' });
    return;
  }
  db.prepare(
    'INSERT OR IGNORE INTO recipe_collections (recipeId, collectionId) VALUES (?, ?)'
  ).run(recipeId, req.params.id);
  res.status(204).end();
});

/** DELETE /api/collections/:id/recipes/:recipeId — remove recipe from collection */
collectionsRouter.delete('/:id/recipes/:recipeId', (req: Request, res: Response) => {
  db.prepare(
    'DELETE FROM recipe_collections WHERE collectionId = ? AND recipeId = ?'
  ).run(req.params.id, req.params.recipeId);
  res.status(204).end();
});

/** DELETE /api/collections/:id — delete a collection */
collectionsRouter.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }
  res.status(204).end();
});
