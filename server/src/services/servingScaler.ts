/**
 * Serving scaler service.
 * Scales ingredient quantities linearly when the user changes the serving count,
 * applying smart rounding rules and auto-converting to friendlier units.
 */

import { DbIngredient } from '../db/schema';
import { getUnitFamily, toBase } from '../utils/unitConversion';
import { parseIngredient } from '../utils/ingredientParser';

// ── Fraction display ──────────────────────────────────────────────────────────

/** (value, string) pairs sorted to handle common fractions */
const FRACTIONS: [number, string][] = [
  [7 / 8, '7/8'],
  [3 / 4, '3/4'],
  [2 / 3, '2/3'],
  [1 / 2, '1/2'],
  [1 / 3, '1/3'],
  [1 / 4, '1/4'],
  [1 / 8, '1/8'],
];
const FRACTION_TOLERANCE = 0.04;

/**
 * Convert a numeric quantity + unit into a human-readable string.
 * e.g. formatQuantity(1.5, 'cup') → "1 1/2 cup"
 *      formatQuantity(0.333, 'cup') → "1/3 cup"
 *      formatQuantity(3, null)     → "3"
 */
export function formatQuantity(num: number, unit: string | null): string {
  if (num <= 0) return unit ? `0 ${unit}` : '0';

  const whole = Math.floor(num);
  const frac = num - whole;

  let fracStr = '';
  for (const [val, str] of FRACTIONS) {
    if (Math.abs(frac - val) <= FRACTION_TOLERANCE) {
      fracStr = str;
      break;
    }
  }

  let numStr: string;
  if (whole > 0 && fracStr) {
    numStr = `${whole} ${fracStr}`;
  } else if (whole > 0) {
    numStr = `${whole}`;
  } else if (fracStr) {
    numStr = fracStr;
  } else {
    // Fall back to decimal, trim trailing zeros
    numStr = parseFloat(num.toFixed(2)).toString();
  }

  return unit ? `${numStr} ${unit}` : numStr;
}

// ── Smart rounding ────────────────────────────────────────────────────────────

/** Units that represent discrete countable items — always round to whole numbers */
const COUNT_UNITS = new Set([
  'piece', 'pieces', 'clove', 'cloves', 'slice', 'slices',
  'sprig', 'sprigs', 'leaf', 'leaves', 'stalk', 'stalks',
  'whole', 'large', 'medium', 'small',
]);

/**
 * Apply smart rounding based on the unit type.
 * - Whole/count items: round to nearest integer, minimum 1
 * - tsp < 1: nearest 1/4 (standard measuring spoon increments)
 * - tsp >= 1: nearest 1/2 (avoids confusing "2 1/4 tsp" display)
 * - tbsp: nearest 1/2
 * - cup: nearest 1/4
 * - grams: nearest 5
 * - oz/lb: nearest 0.25
 * - default: 2 decimal places
 */
export function roundByUnit(qty: number, unit: string | null): number {
  const u = (unit ?? '').toLowerCase();

  // Whole / count items (no unit, or discrete count words)
  if (!unit || COUNT_UNITS.has(u)) {
    return Math.max(1, Math.round(qty));
  }

  // tsp: small amounts → nearest 1/4; amounts ≥ 1 → nearest 1/2
  if (['tsp', 'teaspoon', 'teaspoons'].includes(u)) {
    if (qty >= 1) return Math.round(qty * 2) / 2;
    return Math.round(qty * 4) / 4;
  }

  // tbsp → nearest 1/2
  if (['tbsp', 'tablespoon', 'tablespoons', 'tbs'].includes(u)) {
    return Math.round(qty * 2) / 2;
  }

  // cup → nearest 1/4
  if (['cup', 'cups'].includes(u)) {
    return Math.round(qty * 4) / 4;
  }

  // grams → nearest 5
  if (['g', 'gram', 'grams', 'gm'].includes(u)) {
    return Math.max(5, Math.round(qty / 5) * 5);
  }

  // oz, lb → nearest 0.25
  if (['oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds'].includes(u)) {
    return Math.round(qty * 4) / 4;
  }

  // default: 2 decimal places
  return Math.round(qty * 100) / 100;
}

// ── Unit-aware conversions (serving-scaler specific) ─────────────────────────

/**
 * Volume conversion for the serving scaler.
 * When the original unit was tbsp, stays in tbsp unless the result is too small (≤ 1.5 tsp).
 * This prevents confusing unit flips (e.g. "1 tbsp" scaling down to "2 1/2 tsp").
 * For tsp/cup originals, uses standard thresholds.
 */
function fromBaseTspForScaling(tsp: number, originalUnit?: string): { qty: number; unit: string } {
  const orig = (originalUnit ?? '').toLowerCase();
  const isTbsp = ['tbsp', 'tablespoon', 'tablespoons', 'tbs'].includes(orig);
  const isCup  = ['cup', 'cups'].includes(orig);

  // If original was cup: stay in cup for any result ≥ 1/4 cup (12 tsp)
  // Below 1/4 cup, fall through to tbsp/tsp for practical measuring
  if (isCup) {
    if (tsp >= 12) return { qty: tsp / 48, unit: 'cup' };
    if (tsp >= 3)  return { qty: tsp / 3,  unit: 'tbsp' };
    return { qty: tsp, unit: 'tsp' };
  }

  // Always upgrade to cup for large volumes (> 1/4 cup)
  if (tsp > 12) return { qty: tsp / 48, unit: 'cup' };

  // If original was tbsp: prefer tbsp for any result > 0.5 tbsp (1.5 tsp)
  if (isTbsp) {
    if (tsp > 1.5) return { qty: tsp / 3, unit: 'tbsp' };
    return { qty: tsp, unit: 'tsp' };
  }

  // Default (tsp or unknown): upgrade tsp → tbsp at 1 tbsp threshold
  if (tsp >= 3) return { qty: tsp / 3, unit: 'tbsp' };
  return { qty: tsp, unit: 'tsp' };
}

/**
 * Weight conversion that stays within the original measurement system (metric vs imperial).
 * Never crosses between grams and ounces.
 */
function fromBaseGForScaling(g: number, originalUnit: string): { qty: number; unit: string } {
  const u = originalUnit.toLowerCase();

  // Metric system: g / kg
  if (['g', 'gram', 'grams', 'gm'].includes(u)) {
    if (g >= 1000) return { qty: g / 1000, unit: 'kg' };
    return { qty: g, unit: 'g' };
  }
  if (['kg', 'kilogram', 'kilograms'].includes(u)) {
    return { qty: g / 1000, unit: 'kg' };
  }

  // Imperial system: oz / lb
  if (['oz', 'ounce', 'ounces'].includes(u)) {
    const oz = g / 28.35;
    if (oz >= 16) return { qty: oz / 16, unit: 'lb' };
    return { qty: oz, unit: 'oz' };
  }
  if (['lb', 'pound', 'pounds'].includes(u)) {
    return { qty: g / 453.6, unit: 'lb' };
  }

  // Fallback: stay in original unit
  return { qty: g, unit: originalUnit };
}

// ── Scale pipeline ────────────────────────────────────────────────────────────

const TO_TASTE_PATTERNS = ['to taste', 'as needed', 'as desired', 'to preference', 'pinch'];

export type ScaledIngredient = DbIngredient;

/**
 * Scale a list of ingredients from originalServings to targetServings.
 * Returns a new array — original objects are not mutated.
 * "To taste" items and items with no numericQuantity are passed through unchanged.
 */
export function scaleIngredients(
  ingredients: DbIngredient[],
  originalServings: number,
  targetServings: number,
): ScaledIngredient[] {
  if (originalServings <= 0 || targetServings <= 0) return ingredients;
  const ratio = targetServings / originalServings;
  if (ratio === 1) return ingredients;

  return ingredients.map((ing) => {
    // Skip "to taste" / "as needed" items first
    const qtyLower = (ing.quantity ?? '').toLowerCase();
    if (TO_TASTE_PATTERNS.some((p) => qtyLower.includes(p))) {
      return ing;
    }

    // Resolve numericQuantity — parse on-the-fly for legacy ingredients
    // that were stored before the numericQuantity column was populated.
    let numericQty = ing.numericQuantity ?? null;
    let resolvedUnit = ing.unit ?? null;
    if ((numericQty === null) && ing.quantity) {
      const parsed = parseIngredient(`${ing.quantity} ${ing.item}`);
      numericQty = parsed.numericQuantity;
      if (resolvedUnit === null) resolvedUnit = parsed.unit;
    }

    if (numericQty === null) return ing; // truly unparseable, skip

    const rawScaled = numericQty * ratio;
    const family = getUnitFamily(resolvedUnit);

    let qty: number;
    let newUnit: string | null;

    if (family === 'volume' && resolvedUnit) {
      const result = fromBaseTspForScaling(toBase(rawScaled, resolvedUnit), resolvedUnit);
      qty = result.qty;
      newUnit = result.unit;
    } else if (family === 'weight' && resolvedUnit) {
      const result = fromBaseGForScaling(toBase(rawScaled, resolvedUnit), resolvedUnit);
      qty = result.qty;
      newUnit = result.unit;
    } else {
      qty = rawScaled;
      newUnit = resolvedUnit;
    }

    const rounded = roundByUnit(qty, newUnit);
    const quantity = formatQuantity(rounded, newUnit);

    return { ...ing, numericQuantity: rounded, unit: newUnit, quantity };
  });
}
