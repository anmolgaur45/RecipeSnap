import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db/schema';
import { extractRouter } from './routes/extract';
import { recipesRouter } from './routes/recipes';
import { groceryRouter } from './routes/grocery';
import { pantryRouter } from './routes/pantry';
import { collectionsRouter } from './routes/collections';
import { adaptRouter } from './routes/adapt';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '10mb' }));

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
initDb();
const server = app.listen(PORT, () => {
  console.log(`🍳 RecipeSnap server running on http://localhost:${PORT}`);
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓ (OCR + structuring)' : '✗ (set ANTHROPIC_API_KEY)'}`);
  console.log(`   OpenAI:    ${process.env.OPENAI_API_KEY ? '✓ (Whisper transcription)' : '○ (optional — captions only)'}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
