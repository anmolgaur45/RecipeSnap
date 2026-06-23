import { Router, type Request, type Response, type RequestHandler } from 'express';
import { startSession, completeSession, getSession, getSessionsForRecipe } from '../services/cookSession';
import { requireAuth } from '../middleware/auth';

export const cookRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

cookRouter.use(requireAuth);

// POST /api/cook/sessions — start a new cook session
cookRouter.post(
  '/sessions',
  ah(async (req, res) => {
    const { recipeId, servings, mealPlanEntryId } = req.body as {
      recipeId?: string;
      servings?: number;
      mealPlanEntryId?: number;
    };
    if (!recipeId) {
      res.status(400).json({ error: 'recipeId is required' });
      return;
    }
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
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { rating, notes } = req.body as { rating?: number; notes?: string };
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'rating must be between 1 and 5' });
      return;
    }
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
