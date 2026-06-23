import { Router, type Request, type Response, type RequestHandler } from 'express';
import { getPantryMatches, getAISuggestions, getExpiringAlerts } from '../services/recipeRecommender';
import { requireAuth } from '../middleware/auth';

export const recommendRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

recommendRouter.use(requireAuth);

// GET /api/recommendations/pantry-match
recommendRouter.get(
  '/pantry-match',
  ah(async (req, res) => {
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const minMatch = parseInt(String(req.query.minMatch ?? '0'), 10);
    const prioritizeExpiring = req.query.prioritizeExpiring !== 'false';
    res.json(await getPantryMatches(req.userId!, { limit, minMatch, prioritizeExpiring }));
  }),
);

// POST /api/recommendations/ai-suggest
recommendRouter.post(
  '/ai-suggest',
  ah(async (req, res) => {
    const { prioritizeExpiring } = req.body as { prioritizeExpiring?: boolean };
    res.json(await getAISuggestions(req.userId!, { prioritizeExpiring }));
  }),
);

// GET /api/recommendations/expiring-alerts
recommendRouter.get(
  '/expiring-alerts',
  ah(async (req, res) => {
    res.json(await getExpiringAlerts(req.userId!));
  }),
);
