import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import type { toRecipeRecord } from '../services/recipeStructurer';
import { createJob, getJob, checkExtractRateLimit } from '../queue/jobStore';
import { dispatchExtraction } from '../queue/dispatcher';
import { requireAuth } from '../middleware/auth';
import { assertAllowedSourceUrl, UnsafeUrlError } from '../utils/urlGuard';

export const extractRouter = Router();

extractRouter.use(requireAuth);

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

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/**
 * POST /api/extract
 * Body: { url: string }
 * Returns: { jobId: string } immediately — poll GET /api/extract/jobs/:id.
 */
extractRouter.post(
  '/',
  ah(async (req, res) => {
    const parseResult = ExtractBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0]?.message ?? 'Invalid input' });
      return;
    }

    // SSRF guard: only supported-platform hosts reach yt-dlp.
    try {
      assertAllowedSourceUrl(parseResult.data.url);
    } catch (e) {
      res.status(400).json({ error: e instanceof UnsafeUrlError ? e.message : 'Invalid URL' });
      return;
    }

    // Per-user rate limit on the expensive extraction path.
    const limit = await checkExtractRateLimit(req.userId!);
    if (!limit.ok) {
      if (limit.retryAfterSec) res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: limit.message ?? 'Rate limit exceeded.' });
      return;
    }

    const job = await createJob(parseResult.data.url, req.userId!);
    await dispatchExtraction(job.id);
    res.json({ jobId: job.id });
  }),
);

/**
 * GET /api/extract/jobs/:id
 * Returns current job status, progress log, result (if done), or error (if failed).
 */
extractRouter.get(
  '/jobs/:id',
  ah(async (req, res) => {
    const job = await getJob(req.params.id);
    if (!job || job.userId !== req.userId) {
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
  }),
);
