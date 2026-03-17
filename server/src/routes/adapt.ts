import { Router, Request, Response } from 'express';

export const adaptRouter = Router();

/**
 * POST /api/adapt
 * Body: { recipeId: string; adaptationType: string; prompt?: string }
 * Uses Claude API to adapt a recipe (vegan, gluten-free, keto, etc.)
 * Returns the adapted recipe and records it in recipe_adaptations.
 * TODO: implement once recipeAdapter service is built
 */
adaptRouter.post('/', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
