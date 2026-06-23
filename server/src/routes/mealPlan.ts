import { Router, type Request, type Response } from 'express';
import {
  createPlan,
  getActivePlan,
  addEntry,
  updateEntry,
  removeEntry,
  markCooked,
  duplicateDay,
  getDayNutrition,
  getWeekNutrition,
  generateGroceryListFromPlan,
  getGoals,
  updateGoals,
  suggestGoalsAI,
  type MealSlot,
} from '../services/mealPlanManager';
import { requireAuth } from '../middleware/auth';

export const mealPlanRouter = Router();

mealPlanRouter.use(requireAuth);

// ── Goals (must be before /:id routes) ───────────────────────────────────────

mealPlanRouter.get('/goals', async (req: Request, res: Response) => {
  try {
    res.json(await getGoals(req.userId!));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

mealPlanRouter.patch('/goals', async (req: Request, res: Response) => {
  try {
    res.json(await updateGoals(req.userId!, req.body));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

mealPlanRouter.post('/goals/suggest', async (req: Request, res: Response) => {
  try {
    res.json(await suggestGoalsAI(req.body));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── Active plan ───────────────────────────────────────────────────────────────

mealPlanRouter.get('/active', async (req: Request, res: Response) => {
  try {
    const plan = await getActivePlan(req.userId!);
    if (!plan) {
      res.status(404).json({ error: 'No active meal plan' });
      return;
    }
    res.json(plan);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── Entry routes (before /:id) ────────────────────────────────────────────────

mealPlanRouter.patch('/entries/:entryId', async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    res.json(await updateEntry(req.userId!, entryId, req.body));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else res.status(400).json({ error: msg });
  }
});

mealPlanRouter.delete('/entries/:entryId', async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    await removeEntry(req.userId!, entryId);
    res.status(204).send();
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

mealPlanRouter.patch('/entries/:entryId/cooked', async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    res.json(await markCooked(req.userId!, entryId));
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

mealPlanRouter.post('/', async (req: Request, res: Response) => {
  const { startDate, endDate, name } = req.body as { startDate?: string; endDate?: string; name?: string };
  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate and endDate are required' });
    return;
  }
  try {
    res.status(201).json(await createPlan(req.userId!, startDate, endDate, name));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

mealPlanRouter.post('/:id/entries', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { recipeId, date, mealSlot, servings = 2 } = req.body as {
    recipeId?: string;
    date?: string;
    mealSlot?: string;
    servings?: number;
  };
  if (!recipeId || !date || !mealSlot) {
    res.status(400).json({ error: 'recipeId, date, and mealSlot are required' });
    return;
  }
  try {
    res.status(201).json(await addEntry(req.userId!, planId, recipeId, date, mealSlot as MealSlot, servings));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else if (msg.includes('Invalid')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: msg });
  }
});

mealPlanRouter.post('/:id/duplicate-day', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { sourceDate, targetDate } = req.body as { sourceDate?: string; targetDate?: string };
  if (!sourceDate || !targetDate) {
    res.status(400).json({ error: 'sourceDate and targetDate are required' });
    return;
  }
  try {
    res.status(201).json(await duplicateDay(req.userId!, planId, sourceDate, targetDate));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

mealPlanRouter.post('/:id/grocery-list', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.status(201).json(await generateGroceryListFromPlan(req.userId!, planId));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else if (msg.includes('No entries')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: msg });
  }
});

mealPlanRouter.get('/:id/nutrition/:date', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.json(await getDayNutrition(req.userId!, planId, req.params.date));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

mealPlanRouter.get('/:id/nutrition', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.json(await getWeekNutrition(req.userId!, planId));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
