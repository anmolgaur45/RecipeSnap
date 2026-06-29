import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { startSession, completeSession, getSession, getSessionsForRecipe } from '../services/cookSession';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const cookRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

const StartSessionSchema = z.object({
  recipeId: z.string().uuid(),
  servings: z.coerce.number().int().positive().optional(),
  mealPlanEntryId: z.coerce.number().int().optional(),
});

const CompleteSessionSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  notes: z.string().optional(),
});

cookRouter.use(requireAuth);

// POST /api/cook/sessions — start a new cook session
cookRouter.post(
  '/sessions',
  validateBody(StartSessionSchema),
  ah(async (req, res) => {
    const { recipeId, servings, mealPlanEntryId } = req.body as z.infer<typeof StartSessionSchema>;
    const session = await startSession(req.userId!, recipeId, servings ?? 2, mealPlanEntryId);
    if (!session) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    res.json(session);
  }),
);

// POST /api/cook/sessions/:id/complete — mark session complete with rating
cookRouter.post(
  '/sessions/:id/complete',
  validateBody(CompleteSessionSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { rating, notes } = req.body as z.infer<typeof CompleteSessionSchema>;
    const session = await completeSession(req.userId!, id, rating, notes);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  }),
);

// GET /api/cook/sessions/:id — fetch a single session
cookRouter.get(
  '/sessions/:id',
  ah(async (req, res) => {
    const session = await getSession(req.userId!, Number(req.params.id));
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  }),
);

// GET /api/cook/sessions?recipeId=... — list sessions for a recipe
cookRouter.get(
  '/sessions',
  ah(async (req, res) => {
    const { recipeId } = req.query as { recipeId?: string };
    if (!recipeId) {
      res.status(400).json({ error: 'recipeId query param is required' });
      return;
    }
    res.json(await getSessionsForRecipe(req.userId!, recipeId));
  }),
);
