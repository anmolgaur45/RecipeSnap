/**
 * Tests for groceryListBuilder — consolidation, unit conversion,
 * pantry subtraction, and share text generation.
 *
 * The SQLite `db` module is fully mocked — no real database is used.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Stub db BEFORE importing the service ─────────────────────────────────────

type IngRow = {
  id: string; recipeId: string; item: string; quantity: string;
  category: string; isOptional: number; sortOrder: number;
  originalQuantity: null; unit: null; numericQuantity: null; groceryAisle: null;
};
type PantryRow = {
  id: number; item: string; quantity: string | null; unit: string | null;
  category: null; addedAt: string; expiresAt: null; isStaple: number;
};

// Mutable state the mock reads from — tests override these per-test
let ingredientMap: Map<string, IngRow[]> = new Map();
let pantryRows: PantryRow[] = [];

vi.mock('../db/schema', () => {
  const mockDb = {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn((arg?: unknown) => {
        if (sql.includes('ingredients WHERE recipeId')) {
          return ingredientMap.get(arg as string) ?? [];
        }
        if (sql.includes('FROM pantry')) {
          return pantryRows;
        }
        return [];
      }),
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
    })),
    transaction: vi.fn((fn: () => unknown) => fn),
  };
  return { db: mockDb };
});

import { buildListFromRecipes, generateShareText, normalizeItemName } from './groceryListBuilder';

// ── Test data helpers ──────────────────────────────────────────────────────────

function makeIng(id: string, recipeId: string, item: string, quantity: string, sortOrder = 0): IngRow {
  return {
    id, recipeId, item, quantity,
    category: 'other', isOptional: 0, sortOrder,
    originalQuantity: null, unit: null, numericQuantity: null, groceryAisle: null,
  };
}

function makePantry(item: string, quantity: string | null, unit: string | null, isStaple = 0): PantryRow {
  return { id: Math.random(), item, quantity, unit, category: null, addedAt: '', expiresAt: null, isStaple };
}

beforeEach(() => {
  ingredientMap = new Map();
  pantryRows = [];
});

// ── normalizeItemName ─────────────────────────────────────────────────────────

describe('normalizeItemName', () => {
  it('lowercases and trims', () => {
    expect(normalizeItemName('  Garlic  ')).toBe('garlic');
  });

  it('strips stop words', () => {
    expect(normalizeItemName('cloves of garlic')).toBe('cloves garlic');
  });

  it('sorts tokens so "garlic cloves" == "cloves garlic"', () => {
    expect(normalizeItemName('garlic cloves')).toBe(normalizeItemName('cloves garlic'));
  });

  it('removes parentheses and commas', () => {
    const n = normalizeItemName('flour (all-purpose)');
    expect(n).toContain('flour');
  });
});

// ── buildListFromRecipes ──────────────────────────────────────────────────────

describe('buildListFromRecipes', () => {

  // ── Basic single-recipe ──────────────────────────────────────────────────

  it('returns items from a single recipe classified by aisle', () => {
    ingredientMap.set('r1', [
      makeIng('i1', 'r1', 'garlic', '3 cloves', 0),
      makeIng('i2', 'r1', 'olive oil', '2 tbsp', 1),
      makeIng('i3', 'r1', 'salt', 'to taste', 2),
    ]);

    const result = buildListFromRecipes(['r1'], false);
    expect(result.length).toBe(3);
    const items = result.map((r) => r.item);
    expect(items).toContain('garlic');
    expect(items).toContain('olive oil');
    expect(items).toContain('salt');

    const garlicAisle = result.find((r) => r.item === 'garlic')?.aisle;
    expect(garlicAisle).toBe('produce');
  });

  // ── Multi-recipe consolidation ──────────────────────────────────────────

  it('sums same-unit volumes: r1=2 cups flour, r2=1 cup flour → 3 cups', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'flour', '2 cups')]);
    ingredientMap.set('r2', [makeIng('i2', 'r2', 'flour', '1 cup')]);

    const result = buildListFromRecipes(['r1', 'r2'], false);
    const flour = result.find((r) => r.item === 'flour');
    expect(flour).toBeDefined();
    expect(flour!.numericQuantity).toBeCloseTo(3);
    expect(flour!.unit).toBe('cup');
  });

  it('converts units: 4 tbsp + 1/4 cup butter → 8 tbsp', () => {
    // 4 tbsp = 12 tsp; 1/4 cup = 12 tsp; total = 24 tsp = 8 tbsp
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'butter', '4 tbsp')]);
    ingredientMap.set('r2', [makeIng('i2', 'r2', 'butter', '1/4 cup')]);

    const result = buildListFromRecipes(['r1', 'r2'], false);
    const butter = result.find((r) => r.item === 'butter');
    expect(butter).toBeDefined();
    expect(butter!.numericQuantity).toBeCloseTo(8);
    expect(butter!.unit).toBe('tbsp');
  });

  it('"to taste" items appear exactly once, never summed', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'salt', 'to taste')]);
    ingredientMap.set('r2', [makeIng('i2', 'r2', 'salt', 'to taste')]);

    const result = buildListFromRecipes(['r1', 'r2'], false);
    const saltEntries = result.filter((r) => r.item === 'salt');
    expect(saltEntries).toHaveLength(1);
    expect(saltEntries[0].quantity).toBe('to taste');
    expect(saltEntries[0].numericQuantity).toBeNull();
  });

  it('"as needed" treated as to-taste', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'pepper', 'as needed')]);
    ingredientMap.set('r2', [makeIng('i2', 'r2', 'pepper', 'as needed')]);

    const result = buildListFromRecipes(['r1', 'r2'], false);
    const entries = result.filter((r) => r.item === 'pepper');
    expect(entries).toHaveLength(1);
    expect(entries[0].numericQuantity).toBeNull();
  });

  // ── Source tracking ────────────────────────────────────────────────────

  it('includes both recipe IDs when item appears in 2 recipes', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'onion', '1')]);
    ingredientMap.set('r2', [makeIng('i2', 'r2', 'onion', '2')]);

    const result = buildListFromRecipes(['r1', 'r2'], false);
    const onion = result.find((r) => r.item === 'onion');
    const ids = JSON.parse(onion!.recipeIds!) as string[];
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('single-recipe items have exactly one recipe ID', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'chicken breast', '2')]);

    const result = buildListFromRecipes(['r1'], false);
    const chicken = result.find((r) => r.item.includes('chicken'));
    const ids = JSON.parse(chicken!.recipeIds!) as string[];
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('r1');
  });

  // ── Pantry subtraction ─────────────────────────────────────────────────

  it('removes item entirely if pantry isStaple=1', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'salt', '1 tsp')]);
    pantryRows = [makePantry('salt', null, null, 1)];

    const result = buildListFromRecipes(['r1'], true);
    expect(result.find((r) => r.item === 'salt')).toBeUndefined();
  });

  it('subtracts pantry qty: need 3 cups, have 1 cup → 2 cups remaining', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'flour', '3 cups')]);
    pantryRows = [makePantry('flour', '1', 'cup', 0)];

    const result = buildListFromRecipes(['r1'], true);
    const flour = result.find((r) => r.item === 'flour');
    expect(flour).toBeDefined();
    expect(flour!.numericQuantity).toBeCloseTo(2);
    expect(flour!.unit).toBe('cup');
  });

  it('removes item when pantry covers full quantity', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'sugar', '1 cup')]);
    pantryRows = [makePantry('sugar', '2', 'cup', 0)];

    const result = buildListFromRecipes(['r1'], true);
    expect(result.find((r) => r.item === 'sugar')).toBeUndefined();
  });

  it('does NOT subtract if subtractPantry=false', () => {
    ingredientMap.set('r1', [makeIng('i1', 'r1', 'salt', '1 tsp')]);
    pantryRows = [makePantry('salt', null, null, 1)];

    const result = buildListFromRecipes(['r1'], false);
    expect(result.find((r) => r.item === 'salt')).toBeDefined();
  });

  // ── Aisle sort order ───────────────────────────────────────────────────

  it('produce items appear before pantry items in sort order', () => {
    ingredientMap.set('r1', [
      makeIng('i1', 'r1', 'olive oil', '2 tbsp', 0),
      makeIng('i2', 'r1', 'garlic', '3 cloves', 1),
    ]);

    const result = buildListFromRecipes(['r1'], false);
    const garlicIdx = result.findIndex((r) => r.item === 'garlic');
    const oilIdx = result.findIndex((r) => r.item === 'olive oil');
    expect(garlicIdx).toBeLessThan(oilIdx);
  });

  it('assigns sequential sortOrder values starting at 0', () => {
    ingredientMap.set('r1', [
      makeIng('i1', 'r1', 'garlic', '2 cloves', 0),
      makeIng('i2', 'r1', 'onion', '1', 1),
      makeIng('i3', 'r1', 'flour', '2 cups', 2),
    ]);

    const result = buildListFromRecipes(['r1'], false);
    const orders = result.map((r) => r.sortOrder).sort((a, b) => a - b);
    expect(orders[0]).toBe(0);
    expect(orders[orders.length - 1]).toBe(orders.length - 1);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

// ── generateShareText ─────────────────────────────────────────────────────────

describe('generateShareText', () => {
  it('groups items by aisle with emoji headers', () => {
    const items = [
      { item: 'garlic', quantity: '3 cloves', aisle: 'produce', isChecked: 0 },
      { item: 'olive oil', quantity: '2 tbsp', aisle: 'pantry', isChecked: 0 },
    ] as Parameters<typeof generateShareText>[1];

    const text = generateShareText('My List', items, 2);
    expect(text).toContain('My List (2 recipes)');
    expect(text).toContain('PRODUCE');
    expect(text).toContain('garlic');
    expect(text).toContain('PANTRY');
    expect(text).toContain('olive oil');
  });

  it('excludes checked items from share text', () => {
    const items = [
      { item: 'milk', quantity: '1 cup', aisle: 'dairy', isChecked: 1 },
      { item: 'cheese', quantity: '100g', aisle: 'dairy', isChecked: 0 },
    ] as Parameters<typeof generateShareText>[1];

    const text = generateShareText('Test', items, 1);
    expect(text).not.toContain('milk');
    expect(text).toContain('cheese');
  });

  it('uses singular "recipe" for single-recipe lists', () => {
    const items = [{ item: 'onion', quantity: '1', aisle: 'produce', isChecked: 0 }] as Parameters<typeof generateShareText>[1];
    const text = generateShareText('Test', items, 1);
    expect(text).toContain('1 recipe)');
    expect(text).not.toContain('1 recipes)');
  });

  it('formats items with checkbox symbol and quantity in parens', () => {
    const items = [{ item: 'flour', quantity: '2 cups', aisle: 'pantry', isChecked: 0 }] as Parameters<typeof generateShareText>[1];
    const text = generateShareText('Test', items, 1);
    expect(text).toContain('☐ flour (2 cups)');
  });

  it('omits parens when quantity is null', () => {
    const items = [{ item: 'saffron', quantity: null, aisle: 'spices', isChecked: 0 }] as Parameters<typeof generateShareText>[1];
    const text = generateShareText('Test', items, 1);
    expect(text).toContain('☐ saffron');
    expect(text).not.toContain('(null)');
  });
});
