import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { cookSessions, recipes } from '../db/schema.pg';
import { requireAuth } from '../middleware/auth';

export const preferencesRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/**
 * GET /api/preferences — preference profile from this user's cook-session history:
 * favourite cuisines, recently cooked IDs, preferred difficulty, average rating.
 */
preferencesRouter.get(
  '/preferences',
  requireAuth,
  ah(async (req, res) => {
    const rows = await db
      .select({
        recipeId: cookSessions.recipeId,
        cuisine: recipes.cuisine,
        difficulty: recipes.difficulty,
        rating: cookSessions.rating,
        completedAt: cookSessions.completedAt,
      })
      .from(cookSessions)
      .innerJoin(recipes, eq(recipes.id, cookSessions.recipeId))
      .where(and(eq(cookSessions.userId, req.userId!), isNotNull(cookSessions.completedAt)))
      .orderBy(desc(cookSessions.completedAt));

    const cookCount = rows.length;

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentlyCookedIds = [
      ...new Set(
        rows.filter((r) => r.completedAt && new Date(r.completedAt).getTime() > cutoff).map((r) => r.recipeId),
      ),
    ];

    const cuisineMap = new Map<string, { count: number; ratingSum: number; ratedCount: number }>();
    for (const row of rows) {
      if (!row.cuisine) continue;
      const entry = cuisineMap.get(row.cuisine) ?? { count: 0, ratingSum: 0, ratedCount: 0 };
      entry.count++;
      if (row.rating != null) {
        entry.ratingSum += row.rating;
        entry.ratedCount++;
      }
      cuisineMap.set(row.cuisine, entry);
    }
    const favoriteCuisines = [...cuisineMap.entries()]
      .map(([cuisine, data]) => ({ cuisine, score: (data.ratedCount > 0 ? data.ratingSum / data.ratedCount : 3) * data.count }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => c.cuisine);

    const diffMap = new Map<string, number>();
    for (const row of rows) {
      if (row.rating != null && row.rating >= 4 && row.difficulty) {
        diffMap.set(row.difficulty, (diffMap.get(row.difficulty) ?? 0) + 1);
      }
    }
    const preferredDifficulty = [...diffMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const ratedRows = rows.filter((r) => r.rating != null);
    const avgRating =
      ratedRows.length > 0 ? ratedRows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedRows.length : null;

    res.json({ cookCount, favoriteCuisines, recentlyCookedIds, preferredDifficulty, avgRating });
  }),
);
