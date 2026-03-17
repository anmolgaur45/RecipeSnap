import { Router } from 'express';
import { z } from 'zod';
import type { toRecipeRecord } from '../services/recipeStructurer';
import { createJob, getJob } from '../queue/jobStore';
import { runExtractionJob } from '../queue/extractWorker';

export const extractRouter = Router();

// The recipe object shape returned by toRecipeRecord and sent to the frontend
export type RecipeRecord = ReturnType<typeof toRecipeRecord>;

// Shared result type used by the worker and the polling endpoint
export interface ExtractionResult {
  recipe: RecipeRecord;
  processingMeta: {
    durationMs: number;
    sourcesUsed: string[];
  };
}

const ExtractBodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

/**
 * POST /api/extract
 * Body: { url: string }
 * Returns: { jobId: string } immediately — poll GET /api/jobs/:id for status.
 */
extractRouter.post('/', (req, res) => {
  const parseResult = ExtractBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0]?.message ?? 'Invalid input' });
    return;
  }

  const job = createJob(parseResult.data.url);
  void runExtractionJob(job); // fire-and-forget
  res.json({ jobId: job.id });
});

/**
 * GET /api/jobs/:id
 * Returns current job status, progress log, result (if done), or error (if failed).
 */
extractRouter.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json({
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    result: job.result ?? null,
    error: job.error ?? null,
  });
});
