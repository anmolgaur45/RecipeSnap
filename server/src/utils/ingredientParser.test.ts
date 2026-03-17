import { describe, it, expect } from 'vitest';
import { parseIngredient, normalizeUnit, classifyAisle, parseAndClassify } from './ingredientParser';

// ── parseIngredient ───────────────────────────────────────────────────────────

describe('parseIngredient', () => {
  // Basic whole number + unit + item
  it('parses "2 cups flour"', () => {
    const r = parseIngredient('2 cups flour');
    expect(r.numericQuantity).toBe(2);
    expect(r.unit).toBe('cup');
    expect(r.item).toBe('flour');
    expect(r.originalText).toBe('2 cups flour');
  });

  it('parses "1/2 tsp salt"', () => {
    const r = parseIngredient('1/2 tsp salt');
    expect(r.numericQuantity).toBeCloseTo(0.5);
    expect(r.unit).toBe('tsp');
    expect(r.item).toBe('salt');
  });

  it('parses "2 1/2 cups all-purpose flour"', () => {
    const r = parseIngredient('2 1/2 cups all-purpose flour');
    expect(r.numericQuantity).toBeCloseTo(2.5);
    expect(r.unit).toBe('cup');
    expect(r.item).toBe('all-purpose flour');
  });

  it('parses "3 large eggs" as piece unit', () => {
    const r = parseIngredient('3 large eggs');
    expect(r.numericQuantity).toBe(3);
    expect(r.unit).toBe('piece');
    expect(r.item).toBe('large eggs');
  });

  it('parses "salt to taste" — no quantity', () => {
    const r = parseIngredient('salt to taste');
    expect(r.numericQuantity).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.item).toBe('salt');
    expect(r.modifier).toBe('to taste');
  });

  it('parses "1 (14 oz) can diced tomatoes" — parenthetical size', () => {
    const r = parseIngredient('1 (14 oz) can diced tomatoes');
    expect(r.numericQuantity).toBe(1);
    expect(r.unit).toBe('can');
    expect(r.item).toBe('diced tomatoes');
    expect(r.size).toBe('14 oz');
  });

  it('parses "2-3 cloves garlic" — range', () => {
    const r = parseIngredient('2-3 cloves garlic');
    expect(r.numericQuantity).toBeCloseTo(2.5);
    expect(r.unit).toBe('clove');
    expect(r.item).toBe('garlic');
    expect(r.range).toEqual([2, 3]);
  });

  // More number formats
  it('parses "½ cup sugar" (vulgar fraction)', () => {
    const r = parseIngredient('½ cup sugar');
    expect(r.numericQuantity).toBeCloseTo(0.5);
    expect(r.unit).toBe('cup');
    expect(r.item).toBe('sugar');
  });

  it('parses "¾ tsp baking powder"', () => {
    const r = parseIngredient('¾ tsp baking powder');
    expect(r.numericQuantity).toBeCloseTo(0.75);
    expect(r.unit).toBe('tsp');
    expect(r.item).toBe('baking powder');
  });

  it('parses "3/4 cup milk"', () => {
    const r = parseIngredient('3/4 cup milk');
    expect(r.numericQuantity).toBeCloseTo(0.75);
    expect(r.unit).toBe('cup');
    expect(r.item).toBe('milk');
  });

  it('parses "1.5 tablespoons olive oil"', () => {
    const r = parseIngredient('1.5 tablespoons olive oil');
    expect(r.numericQuantity).toBeCloseTo(1.5);
    expect(r.unit).toBe('tbsp');
    expect(r.item).toBe('olive oil');
  });

  it('parses "2 tbsp butter"', () => {
    const r = parseIngredient('2 tbsp butter');
    expect(r.numericQuantity).toBe(2);
    expect(r.unit).toBe('tbsp');
    expect(r.item).toBe('butter');
  });

  it('parses "100g parmesan cheese"', () => {
    const r = parseIngredient('100g parmesan cheese');
    expect(r.numericQuantity).toBe(100);
    expect(r.unit).toBe('g');
    expect(r.item).toBe('parmesan cheese');
  });

  it('parses "200ml chicken broth"', () => {
    const r = parseIngredient('200ml chicken broth');
    expect(r.numericQuantity).toBe(200);
    expect(r.unit).toBe('ml');
    expect(r.item).toBe('chicken broth');
  });

  // Modifiers
  it('parses "pepper, to taste"', () => {
    const r = parseIngredient('pepper, to taste');
    expect(r.item).toBe('pepper');
    expect(r.modifier).toBe('to taste');
    expect(r.numericQuantity).toBeNull();
  });

  it('parses "olive oil, as needed"', () => {
    const r = parseIngredient('olive oil, as needed');
    expect(r.item).toBe('olive oil');
    expect(r.modifier).toBe('as needed');
  });

  // Counts
  it('parses "4 chicken thighs"', () => {
    const r = parseIngredient('4 chicken thighs');
    expect(r.numericQuantity).toBe(4);
    expect(r.item).toContain('chicken');
  });

  it('returns full string as item when nothing can be parsed', () => {
    const r = parseIngredient('a pinch of love');
    expect(r.item.length).toBeGreaterThan(0);
    expect(r.originalText).toBe('a pinch of love');
  });

  // originalText preservation
  it('preserves originalText exactly', () => {
    const text = '  2  cups  flour  ';
    const r = parseIngredient(text);
    expect(r.originalText).toBe(text);
  });
});

// ── normalizeUnit ─────────────────────────────────────────────────────────────

describe('normalizeUnit', () => {
  it.each([
    ['tablespoon', 'tbsp'],
    ['tablespoons', 'tbsp'],
    ['Tbsp', 'tbsp'],
    ['tbs', 'tbsp'],
    ['teaspoon', 'tsp'],
    ['teaspoons', 'tsp'],
    ['cups', 'cup'],
    ['cup', 'cup'],
    ['ounce', 'oz'],
    ['ounces', 'oz'],
    ['oz', 'oz'],
    ['pound', 'lb'],
    ['pounds', 'lb'],
    ['lbs', 'lb'],
    ['gram', 'g'],
    ['grams', 'g'],
    ['gm', 'g'],
    ['milliliter', 'ml'],
    ['milliliters', 'ml'],
    ['ml', 'ml'],
    ['mL', 'ml'],
    ['liter', 'l'],
    ['liters', 'l'],
    ['litre', 'l'],
    ['clove', 'clove'],
    ['cloves', 'clove'],
    ['slice', 'slice'],
    ['slices', 'slice'],
    ['can', 'can'],
    ['cans', 'can'],
  ])('normalizes "%s" → "%s"', (input: string, expected: string) => {
    expect(normalizeUnit(input)).toBe(expected);
  });

  it('returns unknown units unchanged', () => {
    expect(normalizeUnit('frobnitzes')).toBe('frobnitzes');
  });
});

// ── classifyAisle ─────────────────────────────────────────────────────────────

describe('classifyAisle', () => {
  it.each([
    ['garlic', 'produce'],
    ['onion', 'produce'],
    ['cherry tomatoes', 'produce'],
    ['spinach', 'produce'],
    ['lemon', 'produce'],
    ['fresh basil', 'produce'],
    ['milk', 'dairy'],
    ['heavy cream', 'dairy'],
    ['cheddar cheese', 'dairy'],
    ['unsalted butter', 'dairy'],
    ['eggs', 'dairy'],
    ['greek yogurt', 'dairy'],
    ['bread', 'bakery'],
    ['sourdough', 'bakery'],
    ['naan', 'bakery'],
    ['chicken breast', 'meat'],
    ['ground beef', 'meat'],
    ['bacon', 'meat'],
    ['salmon fillet', 'meat'],
    ['shrimp', 'meat'],
    ['frozen peas', 'frozen'],
    ['frozen spinach', 'frozen'],
    ['cumin', 'spices'],
    ['paprika', 'spices'],
    ['black pepper', 'spices'],
    ['vanilla extract', 'spices'],
    ['all-purpose flour', 'pantry'],
    ['olive oil', 'pantry'],
    ['soy sauce', 'pantry'],
    ['brown sugar', 'pantry'],
    ['black beans', 'pantry'],
    ['chicken broth', 'beverages'],
    ['vegetable stock', 'beverages'],
    ['white wine', 'beverages'],
    ['orange juice', 'beverages'],
  ] as [string, string][])('classifies "%s" as %s', (item: string, aisle: string) => {
    expect(classifyAisle(item)).toBe(aisle);
  });

  it('returns "other" for unrecognised items', () => {
    expect(classifyAisle('unobtanium crystals')).toBe('other');
  });

  it('classifies "frozen X" prefix as frozen regardless of item', () => {
    expect(classifyAisle('frozen salmon')).toBe('frozen');
    expect(classifyAisle('frozen garlic paste')).toBe('frozen');
  });
});

// ── parseAndClassify ──────────────────────────────────────────────────────────

describe('parseAndClassify', () => {
  it('parses and classifies in one call', () => {
    const r = parseAndClassify('3 cloves garlic');
    expect(r.numericQuantity).toBe(3);
    expect(r.unit).toBe('clove');
    expect(r.item).toBe('garlic');
    expect(r.groceryAisle).toBe('produce');
  });

  it('classifies pantry items', () => {
    const r = parseAndClassify('2 cups all-purpose flour');
    expect(r.groceryAisle).toBe('pantry');
  });

  it('classifies dairy items', () => {
    const r = parseAndClassify('1 cup whole milk');
    expect(r.groceryAisle).toBe('dairy');
  });
});
