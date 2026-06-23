import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth';

export const adaptRouter = Router();

/**
 * POST /api/adapt — standalone adapt endpoint (not yet used by clients).
 * Adaptation is implemented and accessible via POST /api/recipes/:id/adapt.
 * This route exists as a future convenience alias.
 */
adaptRouter.post('/', requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Use POST /api/recipes/:id/adapt instead' });
});
