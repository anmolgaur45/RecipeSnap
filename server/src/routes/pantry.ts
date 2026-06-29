import { Router, type Request, type Response, type RequestHandler } from 'express';
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
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const pantryRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const AddItemSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  displayName: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  expiresAt: z.string().optional(),
  isStaple: z.boolean().optional(),
  notes: z.string().optional(),
});
const QuickAddSchema = z.object({ text: z.string().trim().min(1, 'text is required') });
const BulkAddSchema = z.object({ groceryListId: z.coerce.number().int() });
const SetupStaplesSchema = z.object({
  stapleNames: z.array(z.string()).min(1, 'stapleNames array is required'),
});
const DepleteSchema = z.object({
  recipeId: z.string().uuid(),
  servings: z.coerce.number().int().positive().optional(),
});

pantryRouter.use(requireAuth);

/** GET /api/pantry — list all pantry items with expiry status */
pantryRouter.get(
  '/',
  ah(async (req, res) => {
    res.json(await getAll(req.userId!));
  }),
);

/** GET /api/pantry/expiring — items expiring within 3 days */
pantryRouter.get(
  '/expiring',
  ah(async (req, res) => {
    res.json(await getExpiringItems(req.userId!));
  }),
);

/** POST /api/pantry — add a single item */
pantryRouter.post(
  '/',
  validateBody(AddItemSchema),
  ah(async (req, res) => {
    const { name, displayName, quantity, unit, category, expiresAt, isStaple, notes } =
      req.body as z.infer<typeof AddItemSchema>;
    const item = await addItem(req.userId!, { name, displayName, quantity, unit, category, expiresAt, isStaple, notes });
    res.status(201).json(item);
  }),
);

/** POST /api/pantry/quick-add — AI parse natural text and bulk add */
pantryRouter.post(
  '/quick-add',
  validateBody(QuickAddSchema),
  ah(async (req, res) => {
    const { text } = req.body as z.infer<typeof QuickAddSchema>;
    const items = await quickAddAI(req.userId!, text.trim());
    res.status(201).json(items);
  }),
);

/** POST /api/pantry/bulk-add — add checked items from a grocery list */
pantryRouter.post(
  '/bulk-add',
  validateBody(BulkAddSchema),
  ah(async (req, res) => {
    const { groceryListId } = req.body as z.infer<typeof BulkAddSchema>;
    res.status(201).json(await bulkAddFromGroceryList(req.userId!, groceryListId));
  }),
);

/** POST /api/pantry/setup-staples — onboarding: mark items as staples */
pantryRouter.post(
  '/setup-staples',
  validateBody(SetupStaplesSchema),
  ah(async (req, res) => {
    const { stapleNames } = req.body as z.infer<typeof SetupStaplesSchema>;
    res.status(201).json(await setupStaples(req.userId!, stapleNames));
  }),
);

/** POST /api/pantry/deplete — deplete pantry after cooking a recipe */
pantryRouter.post(
  '/deplete',
  validateBody(DepleteSchema),
  ah(async (req, res) => {
    const { recipeId, servings } = req.body as z.infer<typeof DepleteSchema>;
    res.json({ summary: await depletFromRecipe(req.userId!, recipeId, servings ?? 2) });
  }),
);

/** PATCH /api/pantry/:id — update a pantry item */
pantryRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const updated = await updateItem(req.userId!, id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(updated);
  }),
);

/** DELETE /api/pantry/:id — remove a pantry item */
pantryRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const force = req.query.force === 'true';
    const result = await deleteItem(req.userId!, id, force);
    if (!result.deleted) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Item not found' });
        return;
      }
      if (result.reason === 'is_staple') {
        res.status(409).json({ error: 'Staple items need force=true to delete' });
        return;
      }
    }
    res.status(204).end();
  }),
);
