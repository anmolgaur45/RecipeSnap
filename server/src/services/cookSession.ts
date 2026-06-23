import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { cookSessions, recipes, type DbCookSession } from '../db/schema.pg';

/** Start a cook session for one of the user's recipes. Returns null if not owned. */
export async function startSession(
  userId: string,
  recipeId: string,
  servingsCooked: number,
  mealPlanEntryId?: number,
): Promise<DbCookSession | null> {
  const recipe = (
    await db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId))).limit(1)
  )[0];
  if (!recipe) return null;

  const [session] = await db
    .insert(cookSessions)
    .values({ userId, recipeId, servingsCooked, mealPlanEntryId: mealPlanEntryId ?? null })
    .returning();
  return session;
}

export async function completeSession(
  userId: string,
  id: number,
  rating: number,
  notes?: string,
): Promise<DbCookSession | null> {
  const [session] = await db
    .update(cookSessions)
    .set({ completedAt: new Date(), rating, notes: notes ?? null })
    .where(and(eq(cookSessions.id, id), eq(cookSessions.userId, userId)))
    .returning();
  return session ?? null;
}

export async function getSession(userId: string, id: number): Promise<DbCookSession | undefined> {
  return (
    await db.select().from(cookSessions).where(and(eq(cookSessions.id, id), eq(cookSessions.userId, userId))).limit(1)
  )[0];
}

export async function getSessionsForRecipe(userId: string, recipeId: string): Promise<DbCookSession[]> {
  return db
    .select()
    .from(cookSessions)
    .where(and(eq(cookSessions.userId, userId), eq(cookSessions.recipeId, recipeId)))
    .orderBy(desc(cookSessions.startedAt));
}
