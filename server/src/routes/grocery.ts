import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import { db } from '../db/client';
import { groceryLists, groceryListItems, recipes, type DbGroceryList, type DbGroceryListItem } from '../db/schema.pg';
import { z } from 'zod';
import { buildListFromRecipes, generateShareText, AISLE_ORDER } from '../services/groceryListBuilder';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const groceryRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const CreateListSchema = z.object({
  recipeIds: z.array(z.string().uuid()).min(1, 'recipeIds must be a non-empty array'),
  name: z.string().optional(),
  subtractPantry: z.boolean().default(false),
});
const AddGroceryItemSchema = z.object({ text: z.string().trim().min(1, 'text is required') });
const UpdateGroceryItemSchema = z.object({
  isChecked: z.boolean().optional(),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  numericQuantity: z.number().nullable().optional(),
});

groceryRouter.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeItem(i: DbGroceryListItem) {
  return {
    ...i,
    recipeIds: i.recipeIds ? (JSON.parse(i.recipeIds) as string[]) : i.recipeId ? [i.recipeId] : [],
  };
}

async function ownedList(id: number, userId: string): Promise<DbGroceryList | null> {
  const rows = await db
    .select()
    .from(groceryLists)
    .where(and(eq(groceryLists.id, id), eq(groceryLists.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function hydrateList(list: DbGroceryList) {
  const items = await db
    .select()
    .from(groceryListItems)
    .where(eq(groceryListItems.listId, list.id))
    .orderBy(asc(groceryListItems.sortOrder), asc(groceryListItems.id));

  const total = items.length;
  const checked = items.filter((i) => i.isChecked).length;

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
    recipeIds: list.recipeIds ? (JSON.parse(list.recipeIds) as string[]) : [],
    items: items.map(serializeItem),
    aisles,
    progress: { checked, total },
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** POST / — create a list from this user's recipe IDs */
groceryRouter.post(
  '/',
  validateBody(CreateListSchema),
  ah(async (req, res) => {
    const userId = req.userId!;
    const { recipeIds, name, subtractPantry } = req.body as z.infer<typeof CreateListSchema>;

    const owned = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.userId, userId), inArray(recipes.id, recipeIds)));
    const ownedIds = new Set(owned.map((r) => r.id));
    for (const id of recipeIds) {
      if (!ownedIds.has(id)) {
        res.status(400).json({ error: `Recipe not found: ${id}` });
        return;
      }
    }

    let listName = name?.trim();
    if (!listName) {
      if (recipeIds.length === 1) {
        const [row] = await db
          .select({ title: recipes.title })
          .from(recipes)
          .where(and(eq(recipes.id, recipeIds[0]), eq(recipes.userId, userId)))
          .limit(1);
        listName = row ? `Shopping for ${row.title}` : 'Shopping List';
      } else {
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        listName = `Meal Plan ${dateStr}`;
      }
    }

    const items = await buildListFromRecipes(userId, recipeIds, subtractPantry);

    const created = await db.transaction(async (tx) => {
      const [list] = await tx
        .insert(groceryLists)
        .values({ userId, name: listName!, recipeIds: JSON.stringify(recipeIds) })
        .returning();
      if (items.length > 0) {
        await tx.insert(groceryListItems).values(items.map((it) => ({ ...it, listId: list.id })));
      }
      return list;
    });

    res.status(201).json(await hydrateList(created));
  }),
);

/** GET / — this user's grocery lists (summary, no items) */
groceryRouter.get(
  '/',
  ah(async (req, res) => {
    const lists = await db
      .select()
      .from(groceryLists)
      .where(eq(groceryLists.userId, req.userId!))
      .orderBy(desc(groceryLists.isActive), desc(groceryLists.createdAt));
    res.json(
      lists.map((l) => ({ ...l, recipeIds: l.recipeIds ? (JSON.parse(l.recipeIds) as string[]) : [] })),
    );
  }),
);

/** GET /:id — a specific list with full items */
groceryRouter.get(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const list = await ownedList(id, req.userId!);
    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }
    res.json(await hydrateList(list));
  }),
);

/** PATCH /:id/items/:itemId — toggle checked / update quantity */
groceryRouter.patch(
  '/:id/items/:itemId',
  validateBody(UpdateGroceryItemSchema),
  ah(async (req, res) => {
    const listId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(listId) || !Number.isInteger(itemId)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const list = await ownedList(listId, req.userId!);
    if (!list) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const [item] = await db
      .select()
      .from(groceryListItems)
      .where(and(eq(groceryListItems.id, itemId), eq(groceryListItems.listId, listId)))
      .limit(1);
    if (!item) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const body = req.body as z.infer<typeof UpdateGroceryItemSchema>;
    const set: Partial<typeof groceryListItems.$inferInsert> = {};
    if (body.isChecked !== undefined) set.isChecked = body.isChecked;
    if (body.quantity !== undefined) set.quantity = body.quantity;
    if (body.unit !== undefined) set.unit = body.unit;
    if (body.numericQuantity !== undefined) set.numericQuantity = body.numericQuantity ?? null;
    if (Object.keys(set).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const [updated] = await db.update(groceryListItems).set(set).where(eq(groceryListItems.id, itemId)).returning();
    res.json(serializeItem(updated));
  }),
);

/** POST /:id/items — manually add an item */
groceryRouter.post(
  '/:id/items',
  validateBody(AddGroceryItemSchema),
  ah(async (req, res) => {
    const listId = Number(req.params.id);
    if (!Number.isInteger(listId)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const list = await ownedList(listId, req.userId!);
    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }
    const { text } = req.body as z.infer<typeof AddGroceryItemSchema>;

    const parsed = parseIngredient(text.trim());
    const itemName = parsed.item || text.trim();
    const aisle = classifyAisle(itemName);

    const [{ m: maxOrder }] = await db
      .select({ m: max(groceryListItems.sortOrder) })
      .from(groceryListItems)
      .where(eq(groceryListItems.listId, listId));

    const [newItem] = await db
      .insert(groceryListItems)
      .values({
        listId,
        item: itemName,
        quantity:
          parsed.numericQuantity !== null && parsed.unit ? `${parsed.numericQuantity} ${parsed.unit}` : text.trim(),
        unit: parsed.unit,
        numericQuantity: parsed.numericQuantity,
        aisle,
        sortOrder: (maxOrder ?? -1) + 1,
      })
      .returning();
    res.status(201).json(serializeItem(newItem));
  }),
);

/** DELETE /:id/items/:itemId — remove an item */
groceryRouter.delete(
  '/:id/items/:itemId',
  ah(async (req, res) => {
    const listId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(listId) || !Number.isInteger(itemId)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const list = await ownedList(listId, req.userId!);
    if (!list) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    const deleted = await db
      .delete(groceryListItems)
      .where(and(eq(groceryListItems.id, itemId), eq(groceryListItems.listId, listId)))
      .returning({ id: groceryListItems.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.status(204).end();
  }),
);

/** PATCH /:id/archive — mark list as inactive */
groceryRouter.patch(
  '/:id/archive',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const [updated] = await db
      .update(groceryLists)
      .set({ isActive: false })
      .where(and(eq(groceryLists.id, id), eq(groceryLists.userId, req.userId!)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: 'List not found' });
      return;
    }
    res.json({ ...updated, recipeIds: updated.recipeIds ? (JSON.parse(updated.recipeIds) as string[]) : [] });
  }),
);

/** POST /:id/share — generate shareable text */
groceryRouter.post(
  '/:id/share',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const list = await ownedList(id, req.userId!);
    if (!list) {
      res.status(404).json({ error: 'List not found' });
      return;
    }
    const items = await db
      .select()
      .from(groceryListItems)
      .where(eq(groceryListItems.listId, list.id))
      .orderBy(asc(groceryListItems.sortOrder));
    const recipeCount = list.recipeIds ? (JSON.parse(list.recipeIds) as string[]).length : 1;
    res.json({ text: generateShareText(list.name, items, recipeCount) });
  }),
);

/** DELETE /:id — delete a grocery list */
groceryRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const deleted = await db
      .delete(groceryLists)
      .where(and(eq(groceryLists.id, id), eq(groceryLists.userId, req.userId!)))
      .returning({ id: groceryLists.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'List not found' });
      return;
    }
    res.status(204).end();
  }),
);
