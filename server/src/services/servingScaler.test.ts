/**
 * Tests for servingScaler — formatQuantity, roundByUnit, and scaleIngredients.
 * Pure functions with no DB access — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import { formatQuantity, roundByUnit, scaleIngredients } from './servingScaler';

// ── Helper ────────────────────────────────────────────────────────────────────

type IngRow = {
  id: string; recipeId: string; item: string; quantity: string;
  category: string; isOptional: number; sortOrder: number;
  originalQuantity: null; unit: string | null; numericQuantity: number | null; groceryAisle: null;
};

function makeIng(
  item: string,
  quantity: string,
  numericQuantity: number | null,
  unit: string | null,
): IngRow {
  return {
    id: 'x', recipeId: 'r1', item, quantity, numericQuantity, unit,
    category: 'other', isOptional: 0, sortOrder: 0,
    originalQuantity: null, groceryAisle: null,
  };
}

// ── formatQuantity ────────────────────────────────────────────────────────────

describe('formatQuantity', () => {
  it('0.25 → "1/4 cup"', () => {
    expect(formatQuantity(0.25, 'cup')).toBe('1/4 cup');
  });

  it('0.5 → "1/2 cup"', () => {
    expect(formatQuantity(0.5, 'cup')).toBe('1/2 cup');
  });

  it('0.333 → "1/3 cup" (within tolerance)', () => {
    expect(formatQuantity(1 / 3, 'cup')).toBe('1/3 cup');
  });

  it('1.5 → "1 1/2 cup"', () => {
    expect(formatQuantity(1.5, 'cup')).toBe('1 1/2 cup');
  });

  it('2.25 → "2 1/4 tbsp"', () => {
    expect(formatQuantity(2.25, 'tbsp')).toBe('2 1/4 tbsp');
  });

  it('null unit → no unit suffix', () => {
    expect(formatQuantity(3, null)).toBe('3');
  });

  it('whole number → no fraction', () => {
    expect(formatQuantity(2, 'cup')).toBe('2 cup');
  });
});

// ── roundByUnit ───────────────────────────────────────────────────────────────

describe('roundByUnit', () => {
  it('tsp < 1 rounds to nearest 0.25 (standard measuring spoon steps)', () => {
    expect(roundByUnit(0.1, 'tsp')).toBe(0.0);
    expect(roundByUnit(0.3, 'tsp')).toBe(0.25);
    expect(roundByUnit(0.6, 'tsp')).toBe(0.5);
    expect(roundByUnit(0.9, 'tsp')).toBe(1.0);
  });

  it('tsp >= 1 rounds to nearest 0.5 (avoids "2 1/4 tsp" style confusion)', () => {
    expect(roundByUnit(1.1, 'tsp')).toBe(1.0);
    expect(roundByUnit(1.3, 'tsp')).toBe(1.5);
    expect(roundByUnit(1.6, 'tsp')).toBe(1.5);
    expect(roundByUnit(2.25, 'tsp')).toBe(2.5);
    expect(roundByUnit(2.75, 'tsp')).toBe(3.0);
  });

  it('tbsp rounds to nearest 0.5', () => {
    expect(roundByUnit(2.1, 'tbsp')).toBe(2.0);
    expect(roundByUnit(2.4, 'tbsp')).toBe(2.5);
    expect(roundByUnit(0.75, 'tbsp')).toBe(1.0);
  });

  it('cup rounds to nearest 0.25', () => {
    expect(roundByUnit(0.6, 'cup')).toBe(0.5);
    expect(roundByUnit(0.9, 'cup')).toBe(1.0);
  });

  it('grams rounds to nearest 5', () => {
    expect(roundByUnit(47, 'g')).toBe(45);
    expect(roundByUnit(53, 'g')).toBe(55);
    expect(roundByUnit(2, 'g')).toBe(5); // minimum 5g
  });

  it('null unit (eggs) → whole number, minimum 1', () => {
    expect(roundByUnit(2.4, null)).toBe(2);
    expect(roundByUnit(0.3, null)).toBe(1); // never go below 1
  });

  it('cloves (count unit) → whole number, minimum 1', () => {
    expect(roundByUnit(0.5, 'clove')).toBe(1);
    expect(roundByUnit(3.7, 'cloves')).toBe(4);
  });
});

// ── scaleIngredients ──────────────────────────────────────────────────────────

describe('scaleIngredients', () => {
  it('2× ratio: 2 cups flour → 4 cups', () => {
    const ings = [makeIng('flour', '2 cup', 2, 'cup')];
    const result = scaleIngredients(ings, 4, 8);
    expect(result[0].numericQuantity).toBe(4);
    expect(result[0].unit).toBe('cup');
    expect(result[0].quantity).toBe('4 cup');
  });

  it('unit upgrade: 24 tsp (scaled) → 1/2 cup', () => {
    // 4 tsp × 3× = 12 tsp → 4 tbsp (fromBaseTsp threshold: ≥3→tbsp, ≥48→cup)
    // Let's use 16 tsp × 3 = 48 tsp → 1 cup
    const ings = [makeIng('vanilla', '16 tsp', 16, 'tsp')];
    const result = scaleIngredients(ings, 1, 3);
    expect(result[0].unit).toBe('cup');
    expect(result[0].numericQuantity).toBeCloseTo(1, 1);
  });

  it('cup original: 1/2 cup × 0.5 stays in cup as 1/4 cup (no unit flip to tbsp)', () => {
    // 0.5 cup × 0.5 = 0.25 cup = 12 tsp → isCup path: 12 >= 12 → cup → "1/4 cup"
    const ings = [makeIng('flour', '1/2 cup', 0.5, 'cup')];
    const result = scaleIngredients(ings, 4, 2);
    expect(result[0].unit).toBe('cup');
    expect(result[0].numericQuantity).toBeCloseTo(0.25);
    expect(result[0].quantity).toBe('1/4 cup');
  });

  it('"to taste" items are not scaled', () => {
    const ings = [makeIng('salt', 'to taste', null, null)];
    const result = scaleIngredients(ings, 4, 8);
    expect(result[0].quantity).toBe('to taste');
    expect(result[0].numericQuantity).toBeNull();
  });

  it('whole items: 0.5 egg (after scaling down) → 1 egg minimum', () => {
    const ings = [makeIng('eggs', '1', 1, null)];
    const result = scaleIngredients(ings, 4, 2); // halve: 0.5 → rounds up to 1
    expect(result[0].numericQuantity).toBe(1);
  });

  it('1/4 cup × 2 servings = 1/2 cup (fraction display)', () => {
    // 0.25 cup × 2 = 0.5 cup = 24 tsp → fromBaseTspForScaling(24): 24 > 12 → cup
    const ings = [makeIng('sugar', '1/4 cup', 0.25, 'cup')];
    const result = scaleIngredients(ings, 2, 4);
    expect(result[0].numericQuantity).toBeCloseTo(0.5);
    expect(result[0].unit).toBe('cup');
    expect(result[0].quantity).toBe('1/2 cup');
  });

  it('tbsp original: 1 tbsp × 0.75 stays in tbsp (no unit flip to tsp)', () => {
    // 1 tbsp × 0.75 = 0.75 tbsp = 2.25 tsp > 1.5 → pinned to tbsp → round to 1 tbsp
    const ings = [makeIng('butter', '1 tbsp', 1, 'tbsp')];
    const result = scaleIngredients(ings, 4, 3);
    expect(result[0].unit).toBe('tbsp');
  });

  it('tbsp original: 1 tbsp × 0.5 converts to tsp (too small to stay in tbsp)', () => {
    // 1 tbsp × 0.5 = 0.5 tbsp = 1.5 tsp → NOT > 1.5 → converts to tsp
    const ings = [makeIng('butter', '1 tbsp', 1, 'tbsp')];
    const result = scaleIngredients(ings, 4, 2);
    expect(result[0].unit).toBe('tsp');
    expect(result[0].numericQuantity).toBe(1.5);
    expect(result[0].quantity).toBe('1 1/2 tsp');
  });

  it('ratio=1 returns ingredients unchanged (same reference)', () => {
    const ings = [makeIng('flour', '2 cup', 2, 'cup')];
    const result = scaleIngredients(ings, 4, 4);
    expect(result).toBe(ings); // same array reference
  });

  it('weight scaling: 100g × 2 → 200g', () => {
    const ings = [makeIng('chicken', '100 g', 100, 'g')];
    const result = scaleIngredients(ings, 2, 4);
    expect(result[0].numericQuantity).toBe(200);
    expect(result[0].unit).toBe('g');
  });

  it('weight: 400g × 3 → 1200g → auto-converts to kg (stays metric)', () => {
    // 400g × 3 = 1200g → fromBaseGForScaling(1200, 'g'): 1200 >= 1000 → kg
    const ings = [makeIng('beef', '400 g', 400, 'g')];
    const result = scaleIngredients(ings, 1, 3);
    expect(result[0].unit).toBe('kg');
  });

  it('null numericQuantity passes through unchanged', () => {
    const ings = [makeIng('parsley', 'handful', null, null)];
    const result = scaleIngredients(ings, 2, 4);
    expect(result[0].quantity).toBe('handful');
  });
});
