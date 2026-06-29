import { Router, type Request, type Response, type RequestHandler } from 'express';
import { and, asc, desc, eq, exists, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import {
  recipes,
  ingredients,
  steps,
  recipeTags,
  recipeCollections,
  recipeAdaptations,
  cookSessions,
  type DbRecipe,
} from '../db/schema.pg';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { scaleIngredients } from '../services/servingScaler';
import { adaptRecipe, ADAPTATION_LABELS } from '../services/recipeAdapter';
import { substituteIngredient } from '../services/ingredientSubstituter';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';
import { calculateNutrition } from '../services/nutritionCalculator';

// ── In-memory per-IP rate limiters (per-user limiting comes in Phase 5) ────────
const RATE_WINDOW_MS = 60 * 60 * 1000;

function makeLimiter(max: number) {
  const store = new Map<string, number[]>();
  return (ip: string): boolean => {
    const now = Date.now();
    const hits = (store.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= max) return false;
    hits.push(now);
    store.set(ip, hits);
    return true;
  };
}
const checkAdaptRateLimit = makeLimiter(10);
const checkSubRateLimit = makeLimiter(20);
const clientIp = (req: Request) =>
  (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');

export const recipesRouter = Router();

const SaveRecipeSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().optional(),
  cuisine: z.string().optional(),
  cookTime: z.string().optional(),
  difficulty: z.string().optional(),
  ingredients: z.array(z.object({ item: z.string(), quantity: z.string() })).min(1, 'ingredients array is required'),
  steps: z.array(z.string()).min(1, 'steps array is required'),
});
const ScaleSchema = z.object({ targetServings: z.coerce.number().min(1).max(50) });
const ServingsSchema = z.object({ servings: z.coerce.number().min(1).max(50) });
const AdaptSchema = z.object({
  type: z.enum(['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'keto', 'halal', 'nut-free', 'custom']),
  customPrompt: z.string().optional(),
});
const SubstituteSchema = z.object({
  ingredientId: z.string().uuid(),
  reason: z.enum(['dietary', 'unavailable', 'allergy', 'budget']).default('dietary'),
});

const ah =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

recipesRouter.use(requireAuth);

// ── Hydration ──────────────────────────────────────────────────────────────────

async function hydrate(row: DbRecipe) {
  const [ings, stps] = await Promise.all([
    db.select().from(ingredients).where(eq(ingredients.recipeId, row.id)).orderBy(asc(ingredients.sortOrder)),
    db.select().from(steps).where(eq(steps.recipeId, row.id)).orderBy(asc(steps.stepNumber)),
  ]);

  const nutrition =
    row.caloriesPerServing != null
      ? {
          caloriesPerServing: row.caloriesPerServing,
          proteinGrams: row.proteinGrams ?? 0,
          carbsGrams: row.carbsGrams ?? 0,
          fatGrams: row.fatGrams ?? 0,
          fiberGrams: row.fiberGrams ?? 0,
          sugarGrams: row.sugarGrams ?? 0,
          sodiumMg: row.sodiumMg ?? 0,
          confidence: (row.nutritionConfidence ?? 'medium') as 'high' | 'medium' | 'low',
        }
      : undefined;

  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
    ingredients: ings,
    steps: stps,
    nutrition,
  };
}

/** find a recipe owned by the requesting user, or null */
async function ownedRecipe(id: string, userId: string): Promise<DbRecipe | null> {
  const rows = await db
    .select()
    .from(recipes)
    .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

/** POST /api/recipes — save an AI-suggested recipe directly to the library. */
recipesRouter.post(
  '/',
  validateBody(SaveRecipeSchema),
  ah(async (req, res) => {
    const userId = req.userId!;
    const { title, description, cuisine, cookTime, difficulty, ingredients: ings, steps: stepList } =
      req.body as z.infer<typeof SaveRecipeSchema>;

    const saved = await db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(recipes)
        .values({
          userId,
          title: title.trim(),
          description: description ?? null,
          servings: '2 servings',
          cookTime: cookTime ?? null,
          difficulty: difficulty ?? 'medium',
          cuisine: cuisine ?? null,
          tags: JSON.stringify(['ai-suggested']),
          confidence: 'medium',
          originalServings: 2,
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
        stepList.map((instruction, i) => ({
          recipeId: recipe.id,
          stepNumber: i + 1,
          instruction,
        })),
      );

      return recipe;
    });

    res.status(201).json(await hydrate(saved));
  }),
);

/** GET /api/recipes — list this user's recipes with lastCookRating. */
recipesRouter.get(
  '/',
  ah(async (req, res) => {
    const userId = req.userId!;
    const rows = await db
      .select()
      .from(recipes)
      .where(eq(recipes.userId, userId))
      .orderBy(desc(recipes.createdAt));
    const hydrated = await Promise.all(rows.map(hydrate));

    // latest completed-cook rating per recipe (most recent first wins)
    const sessions = await db
      .select({ recipeId: cookSessions.recipeId, rating: cookSessions.rating })
      .from(cookSessions)
      .where(and(eq(cookSessions.userId, userId), isNotNull(cookSessions.completedAt)))
      .orderBy(desc(cookSessions.completedAt));
    const lastRating = new Map<string, number | null>();
    for (const s of sessions) if (!lastRating.has(s.recipeId)) lastRating.set(s.recipeId, s.rating);

    res.json(hydrated.map((h) => ({ ...h, lastCookRating: lastRating.get(h.id) ?? null })));
  }),
);

/** GET /api/recipes/search — server-side search + filter, scoped to the user. */
recipesRouter.get(
  '/search',
  ah(async (req, res) => {
    const userId = req.userId!;
    const { q, cuisine, diet, difficulty, method, time, category, collectionId, sort = 'recent' } =
      req.query as Record<string, string | undefined>;

    const conds = [eq(recipes.userId, userId)];

    if (q?.trim()) {
      const p = `%${q.trim()}%`;
      const match = or(
        ilike(recipes.title, p),
        ilike(recipes.description, p),
        exists(
          db
            .select({ x: sql`1` })
            .from(ingredients)
            .where(and(eq(ingredients.recipeId, recipes.id), ilike(ingredients.item, p))),
        ),
      );
      if (match) conds.push(match);
    }

    if (difficulty) conds.push(eq(recipes.difficulty, difficulty.toLowerCase()));

    const tagFilters: Array<{ type: string; value: string }> = [];
    if (cuisine) tagFilters.push({ type: 'cuisine', value: cuisine });
    if (diet) tagFilters.push({ type: 'diet', value: diet });
    if (method) tagFilters.push({ type: 'method', value: method });
    if (time) tagFilters.push({ type: 'time', value: time });
    if (category) tagFilters.push({ type: 'category', value: category });

    for (const tf of tagFilters) {
      conds.push(
        exists(
          db
            .select({ x: sql`1` })
            .from(recipeTags)
            .where(
              and(
                eq(recipeTags.recipeId, recipes.id),
                eq(recipeTags.type, tf.type),
                eq(recipeTags.tag, tf.value),
              ),
            ),
        ),
      );
    }

    if (collectionId) {
      const cid = Number(collectionId);
      if (Number.isInteger(cid)) {
        conds.push(
          exists(
            db
              .select({ x: sql`1` })
              .from(recipeCollections)
              .where(
                and(eq(recipeCollections.recipeId, recipes.id), eq(recipeCollections.collectionId, cid)),
              ),
          ),
        );
      }
    }

    const rows = await db
      .select()
      .from(recipes)
      .where(and(...conds))
      .orderBy(sort === 'alpha' ? asc(recipes.title) : desc(recipes.createdAt));

    res.json(await Promise.all(rows.map(hydrate)));
  }),
);

/** GET /api/recipes/:id */
recipesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    res.json(await hydrate(recipe));
  }),
);

/** DELETE /api/recipes/:id — cascades to ingredients/steps/tags/collections/adaptations. */
recipesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const deleted = await db
      .delete(recipes)
      .where(and(eq(recipes.id, req.params.id), eq(recipes.userId, req.userId!)))
      .returning({ id: recipes.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    res.status(204).end();
  }),
);

/** POST /api/recipes/:id/scale — scaled ingredient list, no DB write. */
recipesRouter.post(
  '/:id/scale',
  validateBody(ScaleSchema),
  ah(async (req, res) => {
    const { targetServings: target } = req.body as z.infer<typeof ScaleSchema>;
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const ings = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.recipeId, recipe.id))
      .orderBy(asc(ingredients.sortOrder));
    const scaled = scaleIngredients(ings, recipe.originalServings ?? 4, target);
    res.json({ ingredients: scaled });
  }),
);

/** PATCH /api/recipes/:id/servings — persist new default servings + scaled quantities. */
recipesRouter.patch(
  '/:id/servings',
  validateBody(ServingsSchema),
  ah(async (req, res) => {
    const { servings: target } = req.body as z.infer<typeof ServingsSchema>;
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const ings = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.recipeId, recipe.id))
      .orderBy(asc(ingredients.sortOrder));
    const scaled = scaleIngredients(ings, recipe.originalServings ?? 4, target);

    await db.transaction(async (tx) => {
      await tx
        .update(recipes)
        .set({ servings: `${target} servings`, originalServings: target, updatedAt: new Date() })
        .where(eq(recipes.id, recipe.id));
      for (const ing of scaled) {
        await tx
          .update(ingredients)
          .set({ quantity: ing.quantity, numericQuantity: ing.numericQuantity, unit: ing.unit })
          .where(eq(ingredients.id, ing.id));
      }
    });

    const updated = await ownedRecipe(req.params.id, req.userId!);
    res.json(await hydrate(updated!));
  }),
);

/** POST /api/recipes/:id/adapt — AI adaptation saved as a new recipe owned by the user. */
recipesRouter.post(
  '/:id/adapt',
  validateBody(AdaptSchema),
  ah(async (req, res) => {
    if (!checkAdaptRateLimit(clientIp(req))) {
      res.status(429).json({ error: 'Too many adaptations. Please wait before trying again.' });
      return;
    }
    const { type, customPrompt } = req.body as z.infer<typeof AdaptSchema>;
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const [ings, stps] = await Promise.all([
      db.select().from(ingredients).where(eq(ingredients.recipeId, recipe.id)).orderBy(asc(ingredients.sortOrder)),
      db.select().from(steps).where(eq(steps.recipeId, recipe.id)).orderBy(asc(steps.stepNumber)),
    ]);

    const output = await adaptRecipe(
      {
        title: recipe.title,
        description: recipe.description,
        servings: recipe.servings,
        prepTime: recipe.prepTime,
        cookTime: recipe.cookTime,
        difficulty: recipe.difficulty,
        cuisine: recipe.cuisine,
        tags: recipe.tags,
        notes: recipe.notes,
        ingredients: ings.map((i) => ({
          item: i.item,
          quantity: i.quantity,
          category: i.category,
          isOptional: i.isOptional ? 1 : 0,
        })),
        steps: stps.map((s) => ({
          stepNumber: s.stepNumber,
          instruction: s.instruction,
          duration: s.duration,
          tip: s.tip,
        })),
      },
      type,
      customPrompt,
    );

    if (output.alreadyCompliant) {
      res.json({ alreadyCompliant: true, adaptationType: type });
      return;
    }

    const newTags = [...output.tags, `${ADAPTATION_LABELS[type].toLowerCase()} adaptation`];
    const newRecipe = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(recipes)
        .values({
          userId: req.userId!,
          title: output.title,
          description: output.description,
          servings: output.servings,
          prepTime: output.prepTime,
          cookTime: output.cookTime,
          difficulty: output.difficulty,
          cuisine: output.cuisine,
          tags: JSON.stringify(newTags),
          notes: output.notes,
          sourceUrl: recipe.sourceUrl,
          platform: recipe.platform,
          confidence: 'medium',
          originalServings: recipe.originalServings,
          adaptedFrom: recipe.id,
          adaptationType: type,
        })
        .returning();

      await tx.insert(ingredients).values(
        output.ingredients.map((ing, i) => {
          const parsed = parseIngredient(`${ing.quantity} ${ing.item}`);
          return {
            recipeId: created.id,
            item: ing.item,
            quantity: ing.quantity,
            category: ing.category,
            isOptional: ing.isOptional,
            sortOrder: i,
            unit: parsed.unit,
            numericQuantity: parsed.numericQuantity,
          };
        }),
      );

      await tx.insert(steps).values(
        output.steps.map((s) => ({
          recipeId: created.id,
          stepNumber: s.stepNumber,
          instruction: s.instruction,
          duration: s.duration,
          tip: s.tip,
        })),
      );

      await tx.insert(recipeAdaptations).values({
        originalRecipeId: recipe.id,
        adaptedRecipeId: created.id,
        adaptationType: type,
        prompt: customPrompt ?? null,
      });

      return created;
    });

    res.json({
      alreadyCompliant: false,
      adaptationType: type,
      adaptedRecipe: await hydrate(newRecipe),
      changedIngredients: output.changedIngredients,
      adaptationNotes: output.adaptationNotes,
      confidenceScore: output.confidenceScore,
      flavorImpactNote: output.flavorImpactNote,
    });
  }),
);

/** GET /api/recipes/:id/adaptations — list adaptations derived from the user's recipe. */
recipesRouter.get(
  '/:id/adaptations',
  ah(async (req, res) => {
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const rows = await db
      .select({
        id: recipeAdaptations.id,
        adaptationType: recipeAdaptations.adaptationType,
        prompt: recipeAdaptations.prompt,
        createdAt: recipeAdaptations.createdAt,
        recipeId: recipes.id,
        title: recipes.title,
      })
      .from(recipeAdaptations)
      .innerJoin(recipes, eq(recipeAdaptations.adaptedRecipeId, recipes.id))
      .where(eq(recipeAdaptations.originalRecipeId, recipe.id))
      .orderBy(desc(recipeAdaptations.createdAt));
    res.json(rows);
  }),
);

/** GET /api/recipes/:id/nutrition — stored nutrition (404 if not yet calculated). */
recipesRouter.get(
  '/:id/nutrition',
  ah(async (req, res) => {
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    if (recipe.caloriesPerServing == null) {
      res.status(404).json({ error: 'Nutrition not yet calculated' });
      return;
    }
    res.json({
      caloriesPerServing: recipe.caloriesPerServing,
      proteinGrams: recipe.proteinGrams,
      carbsGrams: recipe.carbsGrams,
      fatGrams: recipe.fatGrams,
      fiberGrams: recipe.fiberGrams,
      sugarGrams: recipe.sugarGrams,
      sodiumMg: recipe.sodiumMg,
      confidence: recipe.nutritionConfidence ?? 'medium',
    });
  }),
);

/** POST /api/recipes/:id/nutrition — (re)calculate and store nutrition. */
recipesRouter.post(
  '/:id/nutrition',
  ah(async (req, res) => {
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const ings = await db
      .select()
      .from(ingredients)
      .where(eq(ingredients.recipeId, recipe.id))
      .orderBy(asc(ingredients.sortOrder));

    const nutrition = await calculateNutrition({
      title: recipe.title,
      servings: recipe.servings,
      ingredients: ings.map((i) => ({
        item: i.item,
        quantity: i.quantity,
        numericQuantity: i.numericQuantity,
        unit: i.unit,
      })),
    });

    await db
      .update(recipes)
      .set({
        caloriesPerServing: nutrition.caloriesPerServing,
        proteinGrams: nutrition.proteinGrams,
        carbsGrams: nutrition.carbsGrams,
        fatGrams: nutrition.fatGrams,
        fiberGrams: nutrition.fiberGrams,
        sugarGrams: nutrition.sugarGrams,
        sodiumMg: nutrition.sodiumMg,
        nutritionConfidence: nutrition.confidence,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, recipe.id));

    const updated = await ownedRecipe(req.params.id, req.userId!);
    res.json(await hydrate(updated!));
  }),
);

/** POST /api/recipes/:id/substitute — AI ingredient substitution suggestions. */
recipesRouter.post(
  '/:id/substitute',
  validateBody(SubstituteSchema),
  ah(async (req, res) => {
    if (!checkSubRateLimit(clientIp(req))) {
      res.status(429).json({ error: 'Too many substitution requests. Please wait before trying again.' });
      return;
    }
    const { ingredientId, reason } = req.body as z.infer<typeof SubstituteSchema>;
    const recipe = await ownedRecipe(req.params.id, req.userId!);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    const [allIngredients, stps] = await Promise.all([
      db.select().from(ingredients).where(eq(ingredients.recipeId, recipe.id)).orderBy(asc(ingredients.sortOrder)),
      db.select().from(steps).where(eq(steps.recipeId, recipe.id)).orderBy(asc(steps.stepNumber)),
    ]);
    const ingredient = allIngredients.find((i) => i.id === ingredientId);
    if (!ingredient) {
      res.status(404).json({ error: 'Ingredient not found' });
      return;
    }

    const result = await substituteIngredient({
      recipeId: recipe.id,
      recipe,
      ingredient,
      allIngredients,
      steps: stps,
      reason,
    });
    res.json(result);
  }),
);
