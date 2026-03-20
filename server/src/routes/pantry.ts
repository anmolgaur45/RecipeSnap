import { Router, Request, Response } from 'express';
import {
  getAll,
  addItem,
  updateItem,
  deleteItem,
  getExpiringItems,
  bulkAddFromGroceryList,
  setupStaples,
  depletFromRecipe,
  quickAddAI,
} from '../services/pantryManager';

export const pantryRouter = Router();

/** GET /api/pantry — list all pantry items with expiry status */
pantryRouter.get('/', (_req: Request, res: Response) => {
  res.json(getAll());
});

/** GET /api/pantry/expiring — items expiring within 3 days */
pantryRouter.get('/expiring', (_req: Request, res: Response) => {
  res.json(getExpiringItems());
});

/** POST /api/pantry — add a single item */
pantryRouter.post('/', (req: Request, res: Response) => {
  const { name, displayName, quantity, unit, category, expiresAt, isStaple, notes } = req.body as {
    name?: string; displayName?: string; quantity?: number; unit?: string;
    category?: string; expiresAt?: string; isStaple?: boolean; notes?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const item = addItem({ name: name.trim(), displayName, quantity, unit, category, expiresAt, isStaple, notes });
  res.status(201).json(item);
});

/** POST /api/pantry/quick-add — AI parse natural text and bulk add */
pantryRouter.post('/quick-add', async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (!text?.trim()) { res.status(400).json({ error: 'text is required' }); return; }
  try {
    const items = await quickAddAI(text.trim());
    res.status(201).json(items);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/pantry/bulk-add — add checked items from a grocery list */
pantryRouter.post('/bulk-add', (req: Request, res: Response) => {
  const { groceryListId } = req.body as { groceryListId?: number };
  if (!groceryListId) { res.status(400).json({ error: 'groceryListId is required' }); return; }
  res.status(201).json(bulkAddFromGroceryList(groceryListId));
});

/** POST /api/pantry/setup-staples — onboarding: mark items as staples */
pantryRouter.post('/setup-staples', (req: Request, res: Response) => {
  const { stapleNames } = req.body as { stapleNames?: string[] };
  if (!Array.isArray(stapleNames) || stapleNames.length === 0) {
    res.status(400).json({ error: 'stapleNames array is required' }); return;
  }
  res.status(201).json(setupStaples(stapleNames));
});

/** POST /api/pantry/deplete — deplete pantry after cooking a recipe */
pantryRouter.post('/deplete', (req: Request, res: Response) => {
  const { recipeId, servings } = req.body as { recipeId?: string; servings?: number };
  if (!recipeId) { res.status(400).json({ error: 'recipeId is required' }); return; }
  res.json({ summary: depletFromRecipe(recipeId, servings ?? 2) });
});

/** PATCH /api/pantry/:id — update a pantry item */
pantryRouter.patch('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const updated = updateItem(id, req.body);
  if (!updated) { res.status(404).json({ error: 'Item not found' }); return; }
  res.json(updated);
});

/** DELETE /api/pantry/:id — remove a pantry item */
pantryRouter.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const force = req.query.force === 'true';
  const result = deleteItem(id, force);
  if (!result.deleted) {
    if (result.reason === 'not_found') { res.status(404).json({ error: 'Item not found' }); return; }
    if (result.reason === 'is_staple') { res.status(409).json({ error: 'Staple items need force=true to delete' }); return; }
  }
  res.status(204).end();
});
