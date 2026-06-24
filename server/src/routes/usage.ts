import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { extractionJobs } from '../db/schema.pg';
import { requireAuth } from '../middleware/auth';

export const usageRouter = Router();

usageRouter.use(requireAuth);

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/**
 * GET /api/usage
 * Per-user extraction cost summary for the current calendar month: count,
 * estimated USD, model token totals, and a breakdown by extraction path.
 * Backs the freemium quota checks later.
 */
usageRouter.get(
  '/',
  ah(async (req, res) => {
    const userId = req.userId!;
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const scope = and(eq(extractionJobs.userId, userId), gte(extractionJobs.createdAt, since));

    const [totals] = await db
      .select({
        extractions: sql<number>`count(*)::int`,
        estimatedCostUsd: sql<number>`coalesce(sum(${extractionJobs.estimatedCostUsd}), 0)`,
        geminiInputTokens: sql<number>`coalesce(sum(${extractionJobs.geminiInputTokens}), 0)::int`,
        geminiOutputTokens: sql<number>`coalesce(sum(${extractionJobs.geminiOutputTokens}), 0)::int`,
        claudeInputTokens: sql<number>`coalesce(sum(${extractionJobs.claudeInputTokens}), 0)::int`,
        claudeOutputTokens: sql<number>`coalesce(sum(${extractionJobs.claudeOutputTokens}), 0)::int`,
        whisperSeconds: sql<number>`coalesce(sum(${extractionJobs.whisperSeconds}), 0)::int`,
      })
      .from(extractionJobs)
      .where(scope);

    const byMode = await db
      .select({ mode: extractionJobs.mode, count: sql<number>`count(*)::int` })
      .from(extractionJobs)
      .where(scope)
      .groupBy(extractionJobs.mode);

    res.json({ since: since.toISOString(), ...totals, byMode });
  }),
);
