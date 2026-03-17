import { Router, Request, Response } from 'express';
import { db, DbGroceryList, DbGroceryListItem } from '../db/schema';
import {
  buildListFromRecipes,
  generateShareText,
  AISLE_ORDER,
} from '../services/groceryListBuilder';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';

export const groceryRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeItem(i: DbGroceryListItem) {
  return {
    ...i,
    isChecked: i.isChecked === 1,
    recipeIds: i.recipeIds
      ? (JSON.parse(i.recipeIds) as string[])
      : i.recipeId
      ? [i.recipeId]
      : [],
  };
}

function hydrateList(list: DbGroceryList) {
  const items = db
    .prepare('SELECT * FROM grocery_list_items WHERE listId = ? ORDER BY sortOrder ASC, id ASC')
    .all(list.id) as DbGroceryListItem[];

  const total = items.length;
  const checked = items.filter((i) => i.isChecked === 1).length;

  // Build aisle-grouped view
  const byAisle = new Map<string, DbGroceryListItem[]>();
  for (const item of items) {
    const aisle = item.aisle ?? 'other';
    if (!byAisle.has(aisle)) byAisle.set(aisle, []);
    byAisle.get(aisle)!.push(item);
  }

  const aisles = [...byAisle.entries()]
    .sort(([a], [b]) => (AISLE_ORDER[a] ?? 8) - (AISLE_ORDER[b] ?? 8))
    .map(([aisle, aisleItems]) => ({ aisle, items: aisleItems.map(serializeItem) }));

  return {
    ...list,
    isActive: list.isActive === 1,
    recipeIds: list.recipeIds ? (JSON.parse(list.recipeIds) as string[]) : [],
    items: items.map(serializeItem),
    aisles,
    progress: { checked, total },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** POST / — create a list from recipe IDs */
groceryRouter.post('/', (req: Request, res: Response) => {
  const {
    recipeIds,
    name,
    subtractPantry = false,
  } = req.body as {
    recipeIds?: string[];
    name?: string;
    subtractPantry?: boolean;
  };

  if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
    res.status(400).json({ error: 'recipeIds must be a non-empty array' });
    return;
  }

  // Verify every recipe exists
  for (const id of recipeIds) {
    const exists = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
    if (!exists) {
      res.status(400).json({ error: `Recipe not found: ${id}` });
      return;
    }
  }

  // Auto-generate list name if not provided
  let listName = name?.trim();
  if (!listName) {
    if (recipeIds.length === 1) {
      const row = db.prepare('SELECT title FROM recipes WHERE id = ?').get(recipeIds[0]) as
        | { title: string }
        | undefined;
      listName = row ? `Shopping for ${row.title}` : 'Shopping List';
    } else {
      const dateStr = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      listName = `Meal Plan — ${dateStr}`;
    }
  }

  const items = buildListFromRecipes(recipeIds, subtractPantry);

  const insertList = db.prepare(
    'INSERT INTO grocery_lists (name, recipeIds) VALUES (?, ?)'
  );
  const insertItem = db.prepare(`
    INSERT INTO grocery_list_items
      (listId, recipeId, recipeIds, item, quantity, unit, numericQuantity, aisle, sortOrder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const run = db.transaction(() => {
    const r = insertList.run(listName!, JSON.stringify(recipeIds));
    const listId = r.lastInsertRowid as number;
    for (const item of items) {
      insertItem.run(
        listId,
        item.recipeId,
        item.recipeIds,
        item.item,
        item.quantity,
        item.unit,
        item.numericQuantity,
        item.aisle,
        item.sortOrder
      );
    }
    return listId;
  });

  const listId = run();
  const list = db
    .prepare('SELECT * FROM grocery_lists WHERE id = ?')
    .get(listId) as DbGroceryList;
  res.status(201).json(hydrateList(list));
});

/** GET / — list all grocery lists (summary, no items) */
groceryRouter.get('/', (_req: Request, res: Response) => {
  const lists = db
    .prepare('SELECT * FROM grocery_lists ORDER BY isActive DESC, createdAt DESC')
    .all() as DbGroceryList[];

  res.json(
    lists.map((l) => ({
      ...l,
      isActive: l.isActive === 1,
      recipeIds: l.recipeIds ? (JSON.parse(l.recipeIds) as string[]) : [],
    }))
  );
});

/** GET /:id — get a specific list with full items */
groceryRouter.get('/:id', (req: Request, res: Response) => {
  const list = db
    .prepare('SELECT * FROM grocery_lists WHERE id = ?')
    .get(req.params.id) as DbGroceryList | undefined;
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.json(hydrateList(list));
});

/** PATCH /:id/items/:itemId — toggle checked / update quantity */
groceryRouter.patch('/:id/items/:itemId', (req: Request, res: Response) => {
  const item = db
    .prepare('SELECT * FROM grocery_list_items WHERE id = ? AND listId = ?')
    .get(req.params.itemId, req.params.id) as DbGroceryListItem | undefined;
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const body = req.body as {
    isChecked?: boolean;
    quantity?: string;
    unit?: string;
    numericQuantity?: number | null;
  };

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.isChecked !== undefined) {
    updates.push('isChecked = ?');
    values.push(body.isChecked ? 1 : 0);
  }
  if (body.quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(body.quantity);
  }
  if (body.unit !== undefined) {
    updates.push('unit = ?');
    values.push(body.unit);
  }
  if (body.numericQuantity !== undefined) {
    updates.push('numericQuantity = ?');
    values.push(body.numericQuantity ?? null);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(item.id);
  db.prepare(`UPDATE grocery_list_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db
    .prepare('SELECT * FROM grocery_list_items WHERE id = ?')
    .get(item.id) as DbGroceryListItem;
  res.json(serializeItem(updated));
});

/** POST /:id/items — manually add an item */
groceryRouter.post('/:id/items', (req: Request, res: Response) => {
  const list = db
    .prepare('SELECT id FROM grocery_lists WHERE id = ?')
    .get(req.params.id) as { id: number } | undefined;
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  const parsed = parseIngredient(text.trim());
  const itemName = parsed.item || text.trim();
  const aisle = classifyAisle(itemName);

  const { m: maxOrder } = db
    .prepare('SELECT MAX(sortOrder) as m FROM grocery_list_items WHERE listId = ?')
    .get(list.id) as { m: number | null };

  const result = db
    .prepare(`
      INSERT INTO grocery_list_items
        (listId, item, quantity, unit, numericQuantity, aisle, sortOrder)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      list.id,
      itemName,
      parsed.numericQuantity !== null && parsed.unit
        ? `${parsed.numericQuantity} ${parsed.unit}`
        : text.trim(),
      parsed.unit,
      parsed.numericQuantity,
      aisle,
      (maxOrder ?? -1) + 1
    );

  const newItem = db
    .prepare('SELECT * FROM grocery_list_items WHERE id = ?')
    .get(result.lastInsertRowid) as DbGroceryListItem;
  res.status(201).json(serializeItem(newItem));
});

/** DELETE /:id/items/:itemId — remove an item */
groceryRouter.delete('/:id/items/:itemId', (req: Request, res: Response) => {
  const result = db
    .prepare('DELETE FROM grocery_list_items WHERE id = ? AND listId = ?')
    .run(req.params.itemId, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  res.status(204).end();
});

/** PATCH /:id/archive — mark list as inactive */
groceryRouter.patch('/:id/archive', (req: Request, res: Response) => {
  const result = db
    .prepare('UPDATE grocery_lists SET isActive = 0 WHERE id = ?')
    .run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const list = db
    .prepare('SELECT * FROM grocery_lists WHERE id = ?')
    .get(req.params.id) as DbGroceryList;
  res.json({ ...list, isActive: false, recipeIds: list.recipeIds ? JSON.parse(list.recipeIds) : [] });
});

/** POST /:id/share — generate shareable text */
groceryRouter.post('/:id/share', (req: Request, res: Response) => {
  const list = db
    .prepare('SELECT * FROM grocery_lists WHERE id = ?')
    .get(req.params.id) as DbGroceryList | undefined;
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const items = db
    .prepare('SELECT * FROM grocery_list_items WHERE listId = ? ORDER BY sortOrder ASC')
    .all(list.id) as DbGroceryListItem[];

  const recipeCount = list.recipeIds
    ? (JSON.parse(list.recipeIds) as string[]).length
    : 1;

  const text = generateShareText(list.name, items, recipeCount);
  res.json({ text });
});

/** DELETE /:id — delete a grocery list */
groceryRouter.delete('/:id', (req: Request, res: Response) => {
  const result = db.prepare('DELETE FROM grocery_lists WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.status(204).end();
});
