import { Router } from 'express';
import {
  startSession,
  completeSession,
  getSession,
  getSessionsForRecipe,
} from '../services/cookSession';

export const cookRouter = Router();

// POST /api/cook/sessions — start a new cook session
cookRouter.post('/sessions', (req, res) => {
  const { recipeId, servings, mealPlanEntryId } = req.body as {
    recipeId?: string;
    servings?: number;
    mealPlanEntryId?: number;
  };

  if (!recipeId) {
    res.status(400).json({ error: 'recipeId is required' });
    return;
  }

  try {
    const session = startSession(recipeId, servings ?? 2, mealPlanEntryId);
    res.json(session);
  } catch (err) {
    console.error('startSession error:', err);
    res.status(500).json({ error: 'Failed to start cook session' });
  }
});

// POST /api/cook/sessions/:id/complete — mark session complete with rating
cookRouter.post('/sessions/:id/complete', (req, res) => {
  const id = Number(req.params.id);
  const { rating, notes } = req.body as { rating?: number; notes?: string };

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'rating must be between 1 and 5' });
    return;
  }

  try {
    const session = completeSession(id, rating, notes);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    console.error('completeSession error:', err);
    res.status(500).json({ error: 'Failed to complete cook session' });
  }
});

// GET /api/cook/sessions/:id — fetch a single session
cookRouter.get('/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  const session = getSession(id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// GET /api/cook/sessions?recipeId=... — list sessions for a recipe
cookRouter.get('/sessions', (req, res) => {
  const { recipeId } = req.query as { recipeId?: string };
  if (!recipeId) {
    res.status(400).json({ error: 'recipeId query param is required' });
    return;
  }
  res.json(getSessionsForRecipe(recipeId));
});
