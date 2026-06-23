import { Router, type Request, type Response, type RequestHandler } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { recipes, ingredients, steps } from '../db/schema.pg';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';
import { requireAuth } from '../middleware/auth';

export const importRecipeRouter = Router();

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

async function hydrateImported(id: string) {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  const [ings, stps] = await Promise.all([
    db.select().from(ingredients).where(eq(ingredients.recipeId, id)).orderBy(asc(ingredients.sortOrder)),
    db.select().from(steps).where(eq(steps.recipeId, id)).orderBy(asc(steps.stepNumber)),
  ]);
  return { ...row, tags: JSON.parse(row.tags) as string[], ingredients: ings, steps: stps };
}

/**
 * POST /api/recipes/import — directly import a structured recipe (e.g. from TheMealDB).
 * Supports sourceUrl, prepTime, and custom tags. Returns the full hydrated recipe.
 */
importRecipeRouter.post(
  '/recipes/import',
  requireAuth,
  ah(async (req, res) => {
    const userId = req.userId!;
    const {
      title,
      description,
      cuisine,
      cookTime,
      prepTime,
      difficulty,
      servings,
      ingredients: ings,
      steps: stepList,
      sourceUrl,
      tags,
      thumbnailUrl,
    } = req.body as {
      title?: string;
      description?: string;
      cuisine?: string;
      cookTime?: string;
      prepTime?: string;
      difficulty?: string;
      servings?: number;
      ingredients?: Array<{ item: string; quantity: string }>;
      steps?: string[];
      sourceUrl?: string;
      tags?: string[];
      thumbnailUrl?: string;
    };

    if (!title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    if (!Array.isArray(ings) || ings.length === 0) {
      res.status(400).json({ error: 'ingredients array is required' });
      return;
    }
    if (!Array.isArray(stepList) || stepList.length === 0) {
      res.status(400).json({ error: 'steps array is required' });
      return;
    }

    const servingStr = servings ? `${servings} servings` : '4 servings';
    const tagsJson = JSON.stringify(['discover', ...(tags ?? [])]);

    const saved = await db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          userId,
          title: title.trim(),
          description: description ?? null,
          servings: servingStr,
          prepTime: prepTime ?? null,
          cookTime: cookTime ?? null,
          difficulty: difficulty ?? 'medium',
          cuisine: cuisine ?? null,
          tags: tagsJson,
          sourceUrl: sourceUrl ?? null,
          confidence: 'medium',
          originalServings: servings ?? 4,
          thumbnailUrl: thumbnailUrl ?? null,
        })
        .returning();

      await tx.insert(ingredients).values(
        ings.map((ing, i) => {
          const parsed = parseIngredient(`${ing.quantity} ${ing.item}`);
          return {
            recipeId: recipe.id,
            item: ing.item,
            quantity: ing.quantity,
            category: classifyAisle(parsed.item),
            sortOrder: i,
            unit: parsed.unit,
            numericQuantity: parsed.numericQuantity,
          };
        }),
      );

      await tx.insert(steps).values(
        stepList.map((instruction, i) => ({ recipeId: recipe.id, stepNumber: i + 1, instruction })),
      );

      return recipe;
    });

    res.status(201).json(await hydrateImported(saved.id));
  }),
);
