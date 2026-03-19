import { Router, Request, Response } from 'express';

export const adaptRouter = Router();

/**
 * POST /api/adapt — standalone adapt endpoint (not yet used by clients).
 * Adaptation is fully implemented and accessible via POST /api/recipes/:id/adapt.
 * This route exists as a future convenience alias.
 */
adaptRouter.post('/', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Use POST /api/recipes/:id/adapt instead' });
});
