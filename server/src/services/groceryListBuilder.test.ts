/**
 * Tests for groceryListBuilder consolidation, unit conversion, pantry
 * subtraction, and share text. These exercise the pure `consolidate` function
 * with plain fixtures, so no database is involved.
 */
import { describe, it, expect } from 'vitest';
import {
  consolidate,
  generateShareText,
  normalizeItemName,
  type SourcedIngredient,
  type PantryLike,
} from './groceryListBuilder';

// ── Test data helpers ──────────────────────────────────────────────────────────

function makeIng(_id: string, recipeId: string, item: string, quantity: string, _sortOrder = 0): SourcedIngredient {
  return { item, quantity, sourceRecipeId: recipeId };
}

function makePantry(item: string, quantity: string | null, unit: string | null, isStaple = false): PantryLike {
  return { item, quantity, unit, isStaple };
}

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
    expect(normalizeItemName('flour (all-purpose)')).toContain('flour');
  });
});

// ── consolidate ────────────────────────────────────────────────────────────────

describe('consolidate', () => {
  it('returns items from a single recipe classified by aisle', () => {
    const result = consolidate(
      [
        makeIng('i1', 'r1', 'garlic', '3 cloves', 0),
        makeIng('i2', 'r1', 'olive oil', '2 tbsp', 1),
        makeIng('i3', 'r1', 'salt', 'to taste', 2),
      ],
      [],
      false,
    );
    expect(result.length).toBe(3);
    const items = result.map((r) => r.item);
    expect(items).toContain('garlic');
    expect(items).toContain('olive oil');
    expect(items).toContain('salt');
    expect(result.find((r) => r.item === 'garlic')?.aisle).toBe('produce');
  });

  it('sums same-unit volumes: r1=2 cups flour, r2=1 cup flour → 3 cups', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'flour', '2 cups'), makeIng('i2', 'r2', 'flour', '1 cup')],
      [],
      false,
    );
    const flour = result.find((r) => r.item === 'flour');
    expect(flour).toBeDefined();
    expect(flour!.numericQuantity).toBeCloseTo(3);
    expect(flour!.unit).toBe('cup');
  });

  it('converts units: 4 tbsp + 1/4 cup butter → 8 tbsp', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'butter', '4 tbsp'), makeIng('i2', 'r2', 'butter', '1/4 cup')],
      [],
      false,
    );
    const butter = result.find((r) => r.item === 'butter');
    expect(butter).toBeDefined();
    expect(butter!.numericQuantity).toBeCloseTo(8);
    expect(butter!.unit).toBe('tbsp');
  });

  it('"to taste" items appear exactly once, never summed', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'salt', 'to taste'), makeIng('i2', 'r2', 'salt', 'to taste')],
      [],
      false,
    );
    const saltEntries = result.filter((r) => r.item === 'salt');
    expect(saltEntries).toHaveLength(1);
    expect(saltEntries[0].quantity).toBe('to taste');
    expect(saltEntries[0].numericQuantity).toBeNull();
  });

  it('"as needed" treated as to-taste', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'pepper', 'as needed'), makeIng('i2', 'r2', 'pepper', 'as needed')],
      [],
      false,
    );
    const entries = result.filter((r) => r.item === 'pepper');
    expect(entries).toHaveLength(1);
    expect(entries[0].numericQuantity).toBeNull();
  });

  it('includes both recipe IDs when item appears in 2 recipes', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'onion', '1'), makeIng('i2', 'r2', 'onion', '2')],
      [],
      false,
    );
    const onion = result.find((r) => r.item === 'onion');
    const ids = JSON.parse(onion!.recipeIds!) as string[];
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('single-recipe items have exactly one recipe ID', () => {
    const result = consolidate([makeIng('i1', 'r1', 'chicken breast', '2')], [], false);
    const chicken = result.find((r) => r.item.includes('chicken'));
    const ids = JSON.parse(chicken!.recipeIds!) as string[];
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe('r1');
  });

  it('removes item entirely if pantry item is a staple', () => {
    const result = consolidate([makeIng('i1', 'r1', 'salt', '1 tsp')], [makePantry('salt', null, null, true)], true);
    expect(result.find((r) => r.item === 'salt')).toBeUndefined();
  });

  it('subtracts pantry qty: need 3 cups, have 1 cup → 2 cups remaining', () => {
    const result = consolidate([makeIng('i1', 'r1', 'flour', '3 cups')], [makePantry('flour', '1', 'cup')], true);
    const flour = result.find((r) => r.item === 'flour');
    expect(flour).toBeDefined();
    expect(flour!.numericQuantity).toBeCloseTo(2);
    expect(flour!.unit).toBe('cup');
  });

  it('removes item when pantry covers full quantity', () => {
    const result = consolidate([makeIng('i1', 'r1', 'sugar', '1 cup')], [makePantry('sugar', '2', 'cup')], true);
    expect(result.find((r) => r.item === 'sugar')).toBeUndefined();
  });

  it('does NOT subtract if subtractPantry=false', () => {
    const result = consolidate([makeIng('i1', 'r1', 'salt', '1 tsp')], [makePantry('salt', null, null, true)], false);
    expect(result.find((r) => r.item === 'salt')).toBeDefined();
  });

  it('produce items appear before pantry items in sort order', () => {
    const result = consolidate(
      [makeIng('i1', 'r1', 'olive oil', '2 tbsp', 0), makeIng('i2', 'r1', 'garlic', '3 cloves', 1)],
      [],
      false,
    );
    expect(result.findIndex((r) => r.item === 'garlic')).toBeLessThan(result.findIndex((r) => r.item === 'olive oil'));
  });

  it('assigns sequential sortOrder values starting at 0', () => {
    const result = consolidate(
      [
        makeIng('i1', 'r1', 'garlic', '2 cloves', 0),
        makeIng('i2', 'r1', 'onion', '1', 1),
        makeIng('i3', 'r1', 'flour', '2 cups', 2),
      ],
      [],
      false,
    );
    const orders = result.map((r) => r.sortOrder).sort((a, b) => a - b);
    expect(orders[0]).toBe(0);
    expect(orders[orders.length - 1]).toBe(orders.length - 1);
    expect(new Set(orders).size).toBe(orders.length);
  });
});

// ── generateShareText ─────────────────────────────────────────────────────────

describe('generateShareText', () => {
  it('groups items by aisle with emoji headers', () => {
    const text = generateShareText(
      'My List',
      [
        { item: 'garlic', quantity: '3 cloves', aisle: 'produce', isChecked: false },
        { item: 'olive oil', quantity: '2 tbsp', aisle: 'pantry', isChecked: false },
      ],
      2,
    );
    expect(text).toContain('My List (2 recipes)');
    expect(text).toContain('PRODUCE');
    expect(text).toContain('garlic');
    expect(text).toContain('PANTRY');
    expect(text).toContain('olive oil');
  });

  it('excludes checked items from share text', () => {
    const text = generateShareText(
      'Test',
      [
        { item: 'milk', quantity: '1 cup', aisle: 'dairy', isChecked: true },
        { item: 'cheese', quantity: '100g', aisle: 'dairy', isChecked: false },
      ],
      1,
    );
    expect(text).not.toContain('milk');
    expect(text).toContain('cheese');
  });

  it('uses singular "recipe" for single-recipe lists', () => {
    const text = generateShareText('Test', [{ item: 'onion', quantity: '1', aisle: 'produce', isChecked: false }], 1);
    expect(text).toContain('1 recipe)');
    expect(text).not.toContain('1 recipes)');
  });

  it('formats items with checkbox symbol and quantity in parens', () => {
    const text = generateShareText('Test', [{ item: 'flour', quantity: '2 cups', aisle: 'pantry', isChecked: false }], 1);
    expect(text).toContain('☐ flour (2 cups)');
  });

  it('omits parens when quantity is null', () => {
    const text = generateShareText('Test', [{ item: 'saffron', quantity: null, aisle: 'spices', isChecked: false }], 1);
    expect(text).toContain('☐ saffron');
    expect(text).not.toContain('(null)');
  });
});
