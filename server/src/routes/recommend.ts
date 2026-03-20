import { Router } from 'express';
import { getPantryMatches, getAISuggestions, getExpiringAlerts } from '../services/recipeRecommender';

export const recommendRouter = Router();

// GET /api/recommendations/pantry-match
recommendRouter.get('/pantry-match', (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const minMatch = parseInt(String(req.query.minMatch ?? '0'), 10);
    const prioritizeExpiring = req.query.prioritizeExpiring !== 'false';

    const results = getPantryMatches({ limit, minMatch, prioritizeExpiring });
    res.json(results);
  } catch (err) {
    console.error('[recommend] pantry-match error:', err);
    res.status(500).json({ error: 'Failed to compute pantry matches' });
  }
});

// POST /api/recommendations/ai-suggest
recommendRouter.post('/ai-suggest', async (req, res) => {
  try {
    const { prioritizeExpiring } = req.body as { prioritizeExpiring?: boolean };
    const suggestions = await getAISuggestions({ prioritizeExpiring });
    res.json(suggestions);
  } catch (err) {
    console.error('[recommend] ai-suggest error:', err);
    res.status(500).json({ error: 'Failed to generate AI suggestions' });
  }
});

// GET /api/recommendations/expiring-alerts
recommendRouter.get('/expiring-alerts', (req, res) => {
  try {
    const alerts = getExpiringAlerts();
    res.json(alerts);
  } catch (err) {
    console.error('[recommend] expiring-alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch expiring alerts' });
  }
});
