import { Router, Request, Response } from 'express';
import { db, DbPantryItem } from '../db/schema';

export const pantryRouter = Router();

/** GET /api/pantry — list all pantry items */
pantryRouter.get('/', (_req: Request, res: Response) => {
  const items = db
    .prepare('SELECT * FROM pantry ORDER BY item ASC')
    .all() as DbPantryItem[];
  res.json(items.map((i) => ({ ...i, isStaple: i.isStaple === 1 })));
});

/** POST /api/pantry — add a pantry item */
pantryRouter.post('/', (req: Request, res: Response) => {
  const { item, quantity, unit, category, expiresAt, isStaple } =
    req.body as Partial<DbPantryItem>;
  if (!item?.trim()) {
    res.status(400).json({ error: 'item is required' });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO pantry (item, quantity, unit, category, expiresAt, isStaple)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      item.trim(),
      quantity ?? null,
      unit ?? null,
      category ?? null,
      expiresAt ?? null,
      isStaple ? 1 : 0
    );
  const row = db
    .prepare('SELECT * FROM pantry WHERE id = ?')
    .get(result.lastInsertRowid) as DbPantryItem;
  res.status(201).json({ ...row, isStaple: row.isStaple === 1 });
});

/** DELETE /api/pantry/:id — remove a pantry item */
pantryRouter.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM pantry WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  res.status(204).end();
});

/** PATCH /api/pantry/:id — update a pantry item */
pantryRouter.patch('/:id', (req: Request, res: Response) => {
  // TODO: implement field-level update
  res.status(501).json({ error: 'Not yet implemented' });
});
