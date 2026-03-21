import { db } from '../db/schema';
import type { DbCookSession } from '../db/schema';

export function startSession(
  recipeId: string,
  servingsCooked: number,
  mealPlanEntryId?: number,
): DbCookSession {
  const result = db
    .prepare(
      `INSERT INTO cook_sessions (recipeId, servingsCooked, mealPlanEntryId)
       VALUES (?, ?, ?)`,
    )
    .run(recipeId, servingsCooked, mealPlanEntryId ?? null);

  return db
    .prepare('SELECT * FROM cook_sessions WHERE id = ?')
    .get(result.lastInsertRowid) as DbCookSession;
}

export function completeSession(
  id: number,
  rating: number,
  notes?: string,
): DbCookSession {
  db.prepare(
    `UPDATE cook_sessions
     SET completedAt = datetime('now'), rating = ?, notes = ?
     WHERE id = ?`,
  ).run(rating, notes ?? null, id);

  return db
    .prepare('SELECT * FROM cook_sessions WHERE id = ?')
    .get(id) as DbCookSession;
}

export function getSession(id: number): DbCookSession | undefined {
  return db
    .prepare('SELECT * FROM cook_sessions WHERE id = ?')
    .get(id) as DbCookSession | undefined;
}

export function getSessionsForRecipe(recipeId: string): DbCookSession[] {
  return db
    .prepare('SELECT * FROM cook_sessions WHERE recipeId = ? ORDER BY startedAt DESC')
    .all(recipeId) as DbCookSession[];
}
