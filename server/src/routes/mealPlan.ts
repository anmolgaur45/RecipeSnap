import { Router, Request, Response } from 'express';
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

export const mealPlanRouter = Router();

// ── Goals (must be before /:id routes) ───────────────────────────────────────

/** GET /goals — get active nutrition goals */
mealPlanRouter.get('/goals', (_req: Request, res: Response) => {
  try {
    res.json(getGoals());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /goals — update nutrition goals */
mealPlanRouter.patch('/goals', (req: Request, res: Response) => {
  const updates = req.body as {
    caloriesTarget?: number;
    proteinTarget?: number;
    carbsTarget?: number;
    fatTarget?: number;
    fiberTarget?: number;
  };
  try {
    res.json(updateGoals(updates));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /goals/suggest — AI-suggest nutrition goals */
mealPlanRouter.post('/goals/suggest', async (req: Request, res: Response) => {
  const profile = req.body as {
    age?: number;
    weightKg?: number;
    activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
    goal?: 'lose' | 'maintain' | 'gain';
  };
  try {
    const result = await suggestGoalsAI(profile);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── Active plan ───────────────────────────────────────────────────────────────

/** GET /active — get the currently active meal plan */
mealPlanRouter.get('/active', (_req: Request, res: Response) => {
  try {
    const plan = getActivePlan();
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

/** PATCH /entries/:entryId — update a meal entry */
mealPlanRouter.patch('/entries/:entryId', (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  const updates = req.body as {
    date?: string;
    mealSlot?: MealSlot;
    servings?: number;
    notes?: string;
  };
  try {
    res.json(updateEntry(entryId, updates));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else res.status(400).json({ error: msg });
  }
});

/** DELETE /entries/:entryId — remove a meal entry */
mealPlanRouter.delete('/entries/:entryId', (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    removeEntry(entryId);
    res.status(204).send();
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

/** PATCH /entries/:entryId/cooked — mark entry as cooked */
mealPlanRouter.patch('/entries/:entryId/cooked', (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    res.json(markCooked(entryId));
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

/** POST / — create a new meal plan */
mealPlanRouter.post('/', (req: Request, res: Response) => {
  const { startDate, endDate, name } = req.body as {
    startDate?: string;
    endDate?: string;
    name?: string;
  };

  if (!startDate || !endDate) {
    res.status(400).json({ error: 'startDate and endDate are required' });
    return;
  }

  try {
    res.status(201).json(createPlan(startDate, endDate, name));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /:id/entries — add a recipe to a meal slot */
mealPlanRouter.post('/:id/entries', (req: Request, res: Response) => {
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
    res.status(201).json(addEntry(planId, recipeId, date, mealSlot as MealSlot, servings));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else if (msg.includes('Invalid')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: msg });
  }
});

/** POST /:id/duplicate-day — duplicate all entries from one day to another */
mealPlanRouter.post('/:id/duplicate-day', (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { sourceDate, targetDate } = req.body as {
    sourceDate?: string;
    targetDate?: string;
  };

  if (!sourceDate || !targetDate) {
    res.status(400).json({ error: 'sourceDate and targetDate are required' });
    return;
  }

  try {
    res.status(201).json(duplicateDay(planId, sourceDate, targetDate));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /:id/grocery-list — generate grocery list from plan */
mealPlanRouter.post('/:id/grocery-list', (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.status(201).json(generateGroceryListFromPlan(planId));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not found')) res.status(404).json({ error: msg });
    else if (msg.includes('No entries')) res.status(400).json({ error: msg });
    else res.status(500).json({ error: msg });
  }
});

/** GET /:id/nutrition/:date — get nutrition for a specific day */
mealPlanRouter.get('/:id/nutrition/:date', (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { date } = req.params;
  try {
    res.json(getDayNutrition(planId, date));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /:id/nutrition — get week nutrition for all 7 days */
mealPlanRouter.get('/:id/nutrition', (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.json(getWeekNutrition(planId));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
