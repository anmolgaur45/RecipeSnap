import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { extractRouter } from './routes/extract';
import { recipesRouter } from './routes/recipes';
import { groceryRouter } from './routes/grocery';
import { pantryRouter } from './routes/pantry';
import { collectionsRouter } from './routes/collections';
import { adaptRouter } from './routes/adapt';
import { tagsRouter } from './routes/tags';
import { mealPlanRouter } from './routes/mealPlan';
import { recommendRouter } from './routes/recommend';
import { cookRouter } from './routes/cook';
import { preferencesRouter } from './routes/preferences';
import { importRecipeRouter } from './routes/importRecipe';
import { usageRouter } from './routes/usage';
import { workerRouter } from './routes/worker';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Middleware
// helmet sets sensible security headers. crossOriginResourcePolicy is relaxed so
// keyframe thumbnails served in dev remain loadable by the app.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '1mb' }));

// Dev fallback: serve keyframe thumbnails written to local disk. In prod these
// live in Supabase Storage (absolute URLs), so this mount is unused.
const thumbnailsDir = path.resolve(process.env.THUMBNAILS_DIR ?? './data/thumbnails');
app.use('/thumbnails', express.static(thumbnailsDir));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/extract', extractRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/grocery-lists', groceryRouter);
app.use('/api/pantry', pantryRouter);
app.use('/api/collections', collectionsRouter);
app.use('/api/adapt', adaptRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/meal-plans', mealPlanRouter);
app.use('/api/recommendations', recommendRouter);
app.use('/api/cook', cookRouter);
app.use('/api/usage', usageRouter);
app.use('/api', preferencesRouter);
app.use('/api', importRecipeRouter);

// Machine-to-machine worker endpoint (invoked by Cloud Tasks, not the app)
app.use('/worker', workerRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Boot
const server = app.listen(PORT, () => {
  console.log(`🍳 RecipeSnap server running on http://localhost:${PORT}`);
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓ (OCR + structuring)' : '✗ (set ANTHROPIC_API_KEY)'}`);
  console.log(`   OpenAI:    ${process.env.OPENAI_API_KEY ? '✓ (Whisper transcription)' : '○ (optional — captions only)'}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
