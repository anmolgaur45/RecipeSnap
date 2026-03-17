import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { db, DbRecipe, DbIngredient, DbStep } from '../db/schema';
import { scaleIngredients } from '../services/servingScaler';
import { adaptRecipe, isAdaptationType, ADAPTATION_LABELS } from '../services/recipeAdapter';
import { substituteIngredient } from '../services/ingredientSubstituter';
import { parseIngredient } from '../utils/ingredientParser';
import { calculateNutrition } from '../services/nutritionCalculator';

// ── In-memory rate limiters ───────────────────────────────────────────────────
const RATE_WINDOW_MS = 60 * 60 * 1000;

const adaptRateLimitStore = new Map<string, number[]>();
const ADAPT_RATE_MAX = 10;

function checkAdaptRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (adaptRateLimitStore.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (timestamps.length >= ADAPT_RATE_MAX) return false;
  timestamps.push(now);
  adaptRateLimitStore.set(ip, timestamps);
  return true;
}

const subRateLimitStore = new Map<string, number[]>();
const SUB_RATE_MAX = 20;

function checkSubRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (subRateLimitStore.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (timestamps.length >= SUB_RATE_MAX) return false;
  timestamps.push(now);
  subRateLimitStore.set(ip, timestamps);
  return true;
}

export const recipesRouter = Router();

function hydrateRecipe(row: DbRecipe) {
  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(row.id) as DbIngredient[];

  const steps = db
    .prepare('SELECT * FROM steps WHERE recipeId = ? ORDER BY stepNumber ASC')
    .all(row.id) as DbStep[];

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
    ingredients: ingredients.map((i) => ({
      ...i,
      isOptional: i.isOptional === 1,
    })),
    steps,
    nutrition,
  };
}

/** GET /api/recipes — list all saved recipes */
recipesRouter.get('/', (_req: Request, res: Response) => {
  const rows = db
    .prepare('SELECT * FROM recipes ORDER BY createdAt DESC')
    .all() as DbRecipe[];
  res.json(rows.map(hydrateRecipe));
});

/** GET /api/recipes/:id — get a single recipe */
recipesRouter.get('/:id', (req: Request, res: Response) => {
  const row = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;

  if (!row) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  res.json(hydrateRecipe(row));
});

/** DELETE /api/recipes/:id — delete a recipe */
recipesRouter.delete('/:id', (req: Request, res: Response) => {
  const result = db
    .prepare('DELETE FROM recipes WHERE id = ?')
    .run(req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  res.status(204).end();
});

/**
 * POST /api/recipes/:id/scale — return scaled ingredient list without modifying the DB.
 * Body: { targetServings: number }
 */
recipesRouter.post('/:id/scale', (req: Request, res: Response) => {
  const { targetServings } = req.body as { targetServings?: number };
  const parsed = Number(targetServings);
  if (!parsed || parsed < 1 || parsed > 50) {
    res.status(400).json({ error: 'targetServings must be between 1 and 50' });
    return;
  }

  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(req.params.id) as DbIngredient[];

  const originalServings = recipe.originalServings ?? 4;
  const scaled = scaleIngredients(ingredients, originalServings, parsed);

  res.json({
    ingredients: scaled.map((i) => ({ ...i, isOptional: i.isOptional === 1 })),
  });
});

/**
 * PATCH /api/recipes/:id/servings — permanently update default servings + stored quantities.
 * Body: { servings: number }
 */
recipesRouter.patch('/:id/servings', (req: Request, res: Response) => {
  const { servings } = req.body as { servings?: number };
  const parsed = Number(servings);
  if (!parsed || parsed < 1 || parsed > 50) {
    res.status(400).json({ error: 'servings must be between 1 and 50' });
    return;
  }

  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(req.params.id) as DbIngredient[];

  const originalServings = recipe.originalServings ?? 4;
  const scaled = scaleIngredients(ingredients, originalServings, parsed);

  db.transaction(() => {
    db.prepare(
      'UPDATE recipes SET servings = ?, originalServings = ?, updatedAt = ? WHERE id = ?',
    ).run(`${parsed} servings`, parsed, new Date().toISOString(), req.params.id);

    const updateIng = db.prepare(
      'UPDATE ingredients SET quantity = ?, numericQuantity = ?, unit = ? WHERE id = ?',
    );
    for (const ing of scaled) {
      updateIng.run(ing.quantity, ing.numericQuantity, ing.unit, ing.id);
    }
  })();

  res.json(hydrateRecipe(recipe));
});

/**
 * POST /api/recipes/:id/adapt — run AI adaptation, save as a new recipe.
 * Body: { type: AdaptationType, customPrompt?: string }
 * Returns: { adaptedRecipe, changedIngredients, adaptationNotes, confidenceScore, flavorImpactNote, alreadyCompliant }
 */
recipesRouter.post('/:id/adapt', (req: Request, res: Response): void => {
  // Rate limit
  const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
  if (!checkAdaptRateLimit(ip)) {
    res.status(429).json({ error: 'Too many adaptations. Please wait before trying again.' });
    return;
  }

  const { type, customPrompt } = req.body as { type?: string; customPrompt?: string };
  if (!isAdaptationType(type)) {
    res.status(400).json({ error: 'Invalid adaptation type. Must be one of: vegan, vegetarian, gluten-free, dairy-free, keto, halal, nut-free, custom' });
    return;
  }

  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(req.params.id) as DbIngredient[];

  const steps = db
    .prepare('SELECT * FROM steps WHERE recipeId = ? ORDER BY stepNumber ASC')
    .all(req.params.id) as DbStep[];

  // Run adaptation asynchronously (Express async handler)
  void (async () => {
    try {
      const output = await adaptRecipe(
        { ...recipe, ingredients, steps },
        type,
        customPrompt,
      );

      // If already compliant — return without saving a new recipe
      if (output.alreadyCompliant) {
        res.json({ alreadyCompliant: true, adaptationType: type });
        return;
      }

      // Persist the adapted recipe as a new recipe in the DB
      const now = new Date().toISOString();
      const newId = uuid();
      const adaptationLabel = ADAPTATION_LABELS[type];
      const newTags = [...output.tags, `${adaptationLabel.toLowerCase()} adaptation`];

      db.transaction(() => {
        db.prepare(`
          INSERT INTO recipes (id, title, description, servings, prepTime, cookTime,
            difficulty, cuisine, tags, notes, sourceUrl, platform, confidence,
            createdAt, updatedAt, originalServings, adaptedFrom, adaptationType)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newId, output.title, output.description, output.servings,
          output.prepTime, output.cookTime, output.difficulty,
          output.cuisine, JSON.stringify(newTags), output.notes,
          recipe.sourceUrl, recipe.platform, 'medium',
          now, now, recipe.originalServings,
          recipe.id, type,
        );

        const insertIng = db.prepare(`
          INSERT INTO ingredients (id, recipeId, item, quantity, category, isOptional, sortOrder,
            unit, numericQuantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        output.ingredients.forEach((ing, i) => {
          const parsed = parseIngredient(`${ing.quantity} ${ing.item}`);
          insertIng.run(
            uuid(), newId, ing.item, ing.quantity,
            ing.category, ing.isOptional ? 1 : 0, i,
            parsed.unit, parsed.numericQuantity,
          );
        });

        const insertStep = db.prepare(`
          INSERT INTO steps (id, recipeId, stepNumber, instruction, duration, tip)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        output.steps.forEach((step) => {
          insertStep.run(uuid(), newId, step.stepNumber, step.instruction, step.duration, step.tip);
        });

        db.prepare(`
          INSERT INTO recipe_adaptations (originalRecipeId, adaptedRecipeId, adaptationType, prompt)
          VALUES (?, ?, ?, ?)
        `).run(recipe.id, newId, type, customPrompt ?? null);
      })();

      const newRecipeRow = db
        .prepare('SELECT * FROM recipes WHERE id = ?')
        .get(newId) as DbRecipe;

      res.json({
        alreadyCompliant: false,
        adaptationType: type,
        adaptedRecipe: hydrateRecipe(newRecipeRow),
        changedIngredients: output.changedIngredients,
        adaptationNotes: output.adaptationNotes,
        confidenceScore: output.confidenceScore,
        flavorImpactNote: output.flavorImpactNote,
      });
    } catch (err) {
      console.error('[adapt] Error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Adaptation failed' });
    }
  })();
});

/**
 * GET /api/recipes/:id/adaptations — list all adaptations derived from a recipe.
 */
recipesRouter.get('/:id/adaptations', (req: Request, res: Response) => {
  const rows = db
    .prepare(`
      SELECT ra.id, ra.adaptationType, ra.prompt, ra.createdAt,
             r.id as recipeId, r.title
      FROM recipe_adaptations ra
      JOIN recipes r ON ra.adaptedRecipeId = r.id
      WHERE ra.originalRecipeId = ?
      ORDER BY ra.createdAt DESC
    `)
    .all(req.params.id) as Array<{
      id: number; adaptationType: string; prompt: string | null;
      createdAt: string; recipeId: string; title: string;
    }>;

  res.json(rows);
});

/**
 * GET /api/recipes/:id/nutrition — return stored nutrition data (404 if not yet calculated).
 */
recipesRouter.get('/:id/nutrition', (req: Request, res: Response) => {
  const row = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;

  if (!row) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  if (row.caloriesPerServing == null) {
    res.status(404).json({ error: 'Nutrition not yet calculated' });
    return;
  }

  res.json({
    caloriesPerServing: row.caloriesPerServing,
    proteinGrams: row.proteinGrams,
    carbsGrams: row.carbsGrams,
    fatGrams: row.fatGrams,
    fiberGrams: row.fiberGrams,
    sugarGrams: row.sugarGrams,
    sodiumMg: row.sodiumMg,
    confidence: row.nutritionConfidence ?? 'medium',
  });
});

/**
 * POST /api/recipes/:id/nutrition — (re)calculate nutrition and store it.
 * Returns the full updated recipe so the client can update its local state.
 */
recipesRouter.post('/:id/nutrition', (req: Request, res: Response): void => {
  const row = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;

  if (!row) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const ingredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(req.params.id) as DbIngredient[];

  void (async () => {
    try {
      const nutrition = await calculateNutrition({
        title: row.title,
        servings: row.servings,
        ingredients,
      });

      db.prepare(`
        UPDATE recipes
        SET caloriesPerServing = ?, proteinGrams = ?, carbsGrams = ?, fatGrams = ?,
            fiberGrams = ?, sugarGrams = ?, sodiumMg = ?, nutritionConfidence = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(
        nutrition.caloriesPerServing, nutrition.proteinGrams, nutrition.carbsGrams,
        nutrition.fatGrams, nutrition.fiberGrams, nutrition.sugarGrams, nutrition.sodiumMg,
        nutrition.confidence, new Date().toISOString(), req.params.id,
      );

      const updated = db
        .prepare('SELECT * FROM recipes WHERE id = ?')
        .get(req.params.id) as DbRecipe;

      res.json(hydrateRecipe(updated));
    } catch (err) {
      console.error('[nutrition] Error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Nutrition calculation failed' });
    }
  })();
});

/**
 * POST /api/recipes/:id/substitute — suggest AI-powered ingredient substitutions.
 * Body: { ingredientId: string, reason?: 'dietary'|'unavailable'|'allergy'|'budget' }
 * Returns: SubstitutionResult (originalIngredient, substitutions[], recipeSpecificAdvice)
 */
recipesRouter.post('/:id/substitute', (req: Request, res: Response): void => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
  if (!checkSubRateLimit(ip)) {
    res.status(429).json({ error: 'Too many substitution requests. Please wait before trying again.' });
    return;
  }

  const { ingredientId, reason = 'dietary' } = req.body as {
    ingredientId?: string;
    reason?: string;
  };

  if (!ingredientId) {
    res.status(400).json({ error: 'ingredientId is required' });
    return;
  }

  const VALID_REASONS = ['dietary', 'unavailable', 'allergy', 'budget'];
  if (!VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: 'reason must be one of: dietary, unavailable, allergy, budget' });
    return;
  }

  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(req.params.id) as DbRecipe | undefined;
  if (!recipe) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }

  const allIngredients = db
    .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
    .all(req.params.id) as DbIngredient[];

  const steps = db
    .prepare('SELECT * FROM steps WHERE recipeId = ? ORDER BY stepNumber ASC')
    .all(req.params.id) as DbStep[];

  const ingredient = allIngredients.find((i) => i.id === ingredientId);
  if (!ingredient) {
    res.status(404).json({ error: 'Ingredient not found' });
    return;
  }

  void (async () => {
    try {
      const result = await substituteIngredient({
        recipeId: req.params.id,
        recipe,
        ingredient,
        allIngredients,
        steps,
        reason,
      });
      res.json(result);
    } catch (err) {
      console.error('[substitute] Error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Substitution failed' });
    }
  })();
});
