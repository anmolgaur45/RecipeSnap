import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
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
import { validateBody } from '../middleware/validate';

export const mealPlanRouter = Router();

mealPlanRouter.use(requireAuth);

const MEAL_SLOTS = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'] as const;

const UpdateGoalsSchema = z.object({
  caloriesTarget: z.number().optional(),
  proteinTarget: z.number().optional(),
  carbsTarget: z.number().optional(),
  fatTarget: z.number().optional(),
  fiberTarget: z.number().optional(),
});
const SuggestGoalsSchema = z.object({
  age: z.number().optional(),
  weightKg: z.number().optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
  goal: z.enum(['lose', 'maintain', 'gain']).optional(),
});
const UpdateEntrySchema = z.object({
  date: z.string().optional(),
  mealSlot: z.enum(MEAL_SLOTS).optional(),
  servings: z.coerce.number().int().positive().optional(),
  notes: z.string().optional(),
});
const CreatePlanSchema = z.object({
  startDate: z.string().min(1, 'startDate is required'),
  endDate: z.string().min(1, 'endDate is required'),
  name: z.string().optional(),
});
const AddEntrySchema = z.object({
  recipeId: z.string().uuid(),
  date: z.string().min(1),
  mealSlot: z.enum(MEAL_SLOTS),
  servings: z.coerce.number().int().positive().default(2),
});
const DuplicateDaySchema = z.object({
  sourceDate: z.string().min(1, 'sourceDate is required'),
  targetDate: z.string().min(1, 'targetDate is required'),
});

// Maps a caught error to a status + message: domain errors keep their (app-authored)
// message; anything unexpected is logged and returned as a generic 500 so internal
// detail never leaks to the client.
function sendMealPlanError(res: Response, e: unknown): void {
  const msg = e instanceof Error ? e.message : 'Error';
  if (msg.includes('not found')) {
    res.status(404).json({ error: msg });
    return;
  }
  if (msg.includes('Invalid') || msg.includes('No entries')) {
    res.status(400).json({ error: msg });
    return;
  }
  console.error('[mealPlan]', e);
  res.status(500).json({ error: 'Internal server error' });
}

// ── Goals (must be before /:id routes) ───────────────────────────────────────

mealPlanRouter.get('/goals', async (req: Request, res: Response) => {
  try {
    res.json(await getGoals(req.userId!));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.patch('/goals', validateBody(UpdateGoalsSchema), async (req: Request, res: Response) => {
  try {
    res.json(await updateGoals(req.userId!, req.body as z.infer<typeof UpdateGoalsSchema>));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.post('/goals/suggest', validateBody(SuggestGoalsSchema), async (req: Request, res: Response) => {
  try {
    res.json(await suggestGoalsAI(req.body as z.infer<typeof SuggestGoalsSchema>));
  } catch (e) {
    sendMealPlanError(res, e);
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
    sendMealPlanError(res, e);
  }
});

// ── Entry routes (before /:id) ────────────────────────────────────────────────

mealPlanRouter.patch('/entries/:entryId', validateBody(UpdateEntrySchema), async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    res.json(await updateEntry(req.userId!, entryId, req.body as z.infer<typeof UpdateEntrySchema>));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.delete('/entries/:entryId', async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    await removeEntry(req.userId!, entryId);
    res.status(204).send();
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.patch('/entries/:entryId/cooked', async (req: Request, res: Response) => {
  const entryId = parseInt(req.params.entryId, 10);
  try {
    res.json(await markCooked(req.userId!, entryId));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

// ── Plan CRUD ─────────────────────────────────────────────────────────────────

mealPlanRouter.post('/', validateBody(CreatePlanSchema), async (req: Request, res: Response) => {
  const { startDate, endDate, name } = req.body as z.infer<typeof CreatePlanSchema>;
  try {
    res.status(201).json(await createPlan(req.userId!, startDate, endDate, name));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.post('/:id/entries', validateBody(AddEntrySchema), async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { recipeId, date, mealSlot, servings } = req.body as z.infer<typeof AddEntrySchema>;
  try {
    res.status(201).json(await addEntry(req.userId!, planId, recipeId, date, mealSlot as MealSlot, servings));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.post('/:id/duplicate-day', validateBody(DuplicateDaySchema), async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  const { sourceDate, targetDate } = req.body as z.infer<typeof DuplicateDaySchema>;
  try {
    res.status(201).json(await duplicateDay(req.userId!, planId, sourceDate, targetDate));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.post('/:id/grocery-list', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.status(201).json(await generateGroceryListFromPlan(req.userId!, planId));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.get('/:id/nutrition/:date', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.json(await getDayNutrition(req.userId!, planId, req.params.date));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});

mealPlanRouter.get('/:id/nutrition', async (req: Request, res: Response) => {
  const planId = parseInt(req.params.id, 10);
  try {
    res.json(await getWeekNutrition(req.userId!, planId));
  } catch (e) {
    sendMealPlanError(res, e);
  }
});
