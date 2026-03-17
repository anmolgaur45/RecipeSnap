/**
 * Shared unit conversion tables and helpers.
 * Used by groceryListBuilder and servingScaler.
 */

/** Volume units expressed as tsp equivalents */
export const VOLUME_TO_TSP: Record<string, number> = {
  tsp: 1,
  teaspoon: 1,
  teaspoons: 1,
  tbsp: 3,
  tablespoon: 3,
  tablespoons: 3,
  tbs: 3,
  cup: 48,
  cups: 48,
  'fl oz': 6,
  'fluid ounce': 6,
  'fluid ounces': 6,
  ml: 0.2029,
  milliliter: 0.2029,
  milliliters: 0.2029,
  l: 202.9,
  liter: 202.9,
  liters: 202.9,
  litre: 202.9,
};

/** Weight units expressed as gram equivalents */
export const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  gm: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

export type UnitFamily = 'volume' | 'weight' | 'other';

export function getUnitFamily(unit: string | null | undefined): UnitFamily {
  if (!unit) return 'other';
  const u = unit.toLowerCase();
  if (VOLUME_TO_TSP[u] !== undefined) return 'volume';
  if (WEIGHT_TO_G[u] !== undefined) return 'weight';
  return 'other';
}

/** Convert a quantity to its base unit (tsp for volume, g for weight) */
export function toBase(qty: number, unit: string): number {
  const u = unit.toLowerCase();
  if (VOLUME_TO_TSP[u] !== undefined) return qty * VOLUME_TO_TSP[u];
  if (WEIGHT_TO_G[u] !== undefined) return qty * WEIGHT_TO_G[u];
  return qty;
}

/** Convert tsp base value back to the most readable volume unit */
export function fromBaseTsp(tsp: number): { qty: number; unit: string } {
  if (tsp >= 48) return { qty: Math.round((tsp / 48) * 100) / 100, unit: 'cup' };
  if (tsp >= 3) return { qty: Math.round((tsp / 3) * 100) / 100, unit: 'tbsp' };
  return { qty: Math.round(tsp * 100) / 100, unit: 'tsp' };
}

/** Convert gram base value back to the most readable weight unit */
export function fromBaseG(g: number): { qty: number; unit: string } {
  if (g >= 453.6) return { qty: Math.round((g / 453.6) * 100) / 100, unit: 'lb' };
  if (g >= 28.35) return { qty: Math.round((g / 28.35) * 100) / 100, unit: 'oz' };
  return { qty: Math.round(g * 100) / 100, unit: 'g' };
}
