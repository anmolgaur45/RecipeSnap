import { db, DbGroceryList, DbGroceryListItem, DbIngredient, DbPantryItem } from '../db/schema';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';
import {
  VOLUME_TO_TSP, WEIGHT_TO_G, UnitFamily,
  getUnitFamily, toBase, fromBaseTsp, fromBaseG,
} from '../utils/unitConversion';

// ── Item name normalization ────────────────────────────────────────────────────

const STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'fresh', 'dried', 'ground']);

export function normalizeItemName(item: string): string {
  return item
    .toLowerCase()
    .replace(/[,().]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .sort()
    .join(' ');
}

// ── Aisle sort order ──────────────────────────────────────────────────────────

export const AISLE_ORDER: Record<string, number> = {
  produce: 0,
  dairy: 1,
  bakery: 2,
  meat: 3,
  frozen: 4,
  spices: 5,
  pantry: 6,
  beverages: 7,
  other: 8,
};

// ── Consolidated item intermediate type ──────────────────────────────────────

interface Consolidated {
  item: string;
  normalizedKey: string;
  totalBase: number | null;
  baseUnit: 'tsp' | 'g' | null;
  family: UnitFamily;
  unit: string | null;
  numericQuantity: number | null;
  rawQuantity: string | null;
  aisle: string;
  sourceRecipeIds: string[];
  isToTaste: boolean;
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build a consolidated grocery list from one or more recipe IDs.
 * Returns items sorted by aisle order then alphabetically.
 */
export function buildListFromRecipes(
  recipeIds: string[],
  subtractPantry: boolean
): Omit<DbGroceryListItem, 'id' | 'listId'>[] {
  // ── Step 1: load ingredients from DB ────────────────────────────────────────
  const allIngredients: (DbIngredient & { sourceRecipeId: string })[] = [];
  for (const recipeId of recipeIds) {
    const rows = db
      .prepare('SELECT * FROM ingredients WHERE recipeId = ? ORDER BY sortOrder ASC')
      .all(recipeId) as DbIngredient[];
    for (const row of rows) {
      allIngredients.push({ ...row, sourceRecipeId: recipeId });
    }
  }

  // ── Step 2: parse + group by normalized item name ────────────────────────────
  const groups = new Map<string, Consolidated>();

  const TO_TASTE_PATTERNS = ['to taste', 'as needed', 'pinch', 'dash'];

  for (const ing of allIngredients) {
    const quantityLower = (ing.quantity ?? '').toLowerCase();
    const hasToTasteQty = TO_TASTE_PATTERNS.some((p) => quantityLower.includes(p));

    // Don't prepend "to taste" / "as needed" to the item name — it confuses the parser
    const rawText =
      ing.quantity && !hasToTasteQty ? `${ing.quantity} ${ing.item}` : ing.item;
    const parsed = parseIngredient(rawText.trim());
    const itemName = parsed.item || ing.item;
    const key = normalizeItemName(itemName);
    const isToTaste =
      hasToTasteQty ||
      (parsed.numericQuantity === null && (parsed.modifier != null || !ing.quantity));
    const family = getUnitFamily(parsed.unit);

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        item: itemName,
        normalizedKey: key,
        totalBase:
          parsed.numericQuantity !== null && parsed.unit && family !== 'other'
            ? toBase(parsed.numericQuantity, parsed.unit)
            : null,
        baseUnit: family === 'volume' ? 'tsp' : family === 'weight' ? 'g' : null,
        family,
        unit: parsed.unit,
        numericQuantity: parsed.numericQuantity,
        rawQuantity: ing.quantity || null,
        aisle: classifyAisle(itemName),
        sourceRecipeIds: [ing.sourceRecipeId],
        isToTaste,
      });
    } else {
      if (!existing.sourceRecipeIds.includes(ing.sourceRecipeId)) {
        existing.sourceRecipeIds.push(ing.sourceRecipeId);
      }
      // "to taste" items are never summed
      if (isToTaste || existing.isToTaste) {
        existing.isToTaste = true;
      } else if (
        parsed.numericQuantity !== null &&
        parsed.unit &&
        existing.family !== 'other' &&
        family === existing.family
      ) {
        // Sum in base units
        existing.totalBase =
          (existing.totalBase ?? 0) + toBase(parsed.numericQuantity, parsed.unit);
      } else if (
        parsed.numericQuantity !== null &&
        existing.numericQuantity !== null &&
        existing.unit === parsed.unit
      ) {
        // Same non-convertible unit (e.g. pieces) — just add
        existing.numericQuantity = existing.numericQuantity + parsed.numericQuantity;
      }
    }
  }

  // ── Step 3: compute display quantities, build output rows ───────────────────
  const rows: Omit<DbGroceryListItem, 'id' | 'listId'>[] = [];

  for (const entry of groups.values()) {
    let displayQty: string | null = null;
    let displayUnit: string | null = entry.unit;
    let numericQty: number | null = entry.numericQuantity;

    if (entry.isToTaste) {
      displayQty = 'to taste';
      displayUnit = null;
      numericQty = null;
    } else if (entry.totalBase !== null && entry.baseUnit === 'tsp') {
      const conv = fromBaseTsp(entry.totalBase);
      numericQty = conv.qty;
      displayUnit = conv.unit;
      displayQty = `${conv.qty} ${conv.unit}`;
    } else if (entry.totalBase !== null && entry.baseUnit === 'g') {
      const conv = fromBaseG(entry.totalBase);
      numericQty = conv.qty;
      displayUnit = conv.unit;
      displayQty = `${conv.qty} ${conv.unit}`;
    } else if (numericQty !== null && displayUnit) {
      displayQty = `${numericQty} ${displayUnit}`;
    } else {
      displayQty = entry.rawQuantity;
    }

    rows.push({
      recipeId: entry.sourceRecipeIds[0] ?? null,
      recipeIds: JSON.stringify(entry.sourceRecipeIds),
      item: entry.item,
      quantity: displayQty,
      unit: displayUnit,
      numericQuantity: numericQty,
      aisle: entry.aisle,
      isChecked: 0,
      sortOrder: 0, // assigned after sort below
    });
  }

  // ── Step 4: pantry subtraction ───────────────────────────────────────────────
  if (subtractPantry) {
    const pantryItems = db.prepare('SELECT * FROM pantry').all() as DbPantryItem[];
    const pantryMap = new Map<string, DbPantryItem>();
    for (const p of pantryItems) {
      pantryMap.set(normalizeItemName(p.item), p);
    }

    const kept: typeof rows = [];
    for (const row of rows) {
      const key = normalizeItemName(row.item);
      const pantry = pantryMap.get(key);
      if (!pantry) {
        kept.push(row);
        continue;
      }
      // Staple pantry item → remove from list entirely
      if (pantry.isStaple === 1) continue;

      // Numeric subtraction if same unit family
      if (
        row.numericQuantity !== null &&
        row.unit !== null &&
        pantry.quantity !== null &&
        pantry.unit !== null
      ) {
        const pantryParsed = parseIngredient(
          `${pantry.quantity} ${pantry.unit} ${pantry.item}`
        );
        const pantryFamily = getUnitFamily(pantryParsed.unit);
        const rowFamily = getUnitFamily(row.unit);
        if (
          pantryFamily === rowFamily &&
          rowFamily !== 'other' &&
          pantryParsed.numericQuantity !== null
        ) {
          const neededBase = toBase(row.numericQuantity, row.unit);
          const haveBase = toBase(pantryParsed.numericQuantity, pantryParsed.unit ?? '');
          const remaining = neededBase - haveBase;
          if (remaining <= 0) continue; // pantry covers full need

          if (rowFamily === 'volume') {
            const conv = fromBaseTsp(remaining);
            row.numericQuantity = conv.qty;
            row.unit = conv.unit;
            row.quantity = `${conv.qty} ${conv.unit}`;
          } else {
            const conv = fromBaseG(remaining);
            row.numericQuantity = conv.qty;
            row.unit = conv.unit;
            row.quantity = `${conv.qty} ${conv.unit}`;
          }
        }
      }
      kept.push(row);
    }
    rows.length = 0;
    rows.push(...kept);
  }

  // ── Step 5: sort by aisle order then alphabetically ──────────────────────────
  rows.sort((a, b) => {
    const oa = AISLE_ORDER[a.aisle ?? 'other'] ?? 8;
    const ob = AISLE_ORDER[b.aisle ?? 'other'] ?? 8;
    if (oa !== ob) return oa - ob;
    return a.item.localeCompare(b.item);
  });

  rows.forEach((row, i) => {
    row.sortOrder = i;
  });

  return rows;
}

// ── Share text ────────────────────────────────────────────────────────────────

const AISLE_EMOJI: Record<string, string> = {
  produce: '🥬',
  dairy: '🧀',
  bakery: '🥖',
  meat: '🥩',
  frozen: '🧊',
  spices: '🌶️',
  pantry: '🥫',
  beverages: '🥤',
  other: '🛒',
};

/**
 * Generate a shareable plain-text version of a grocery list grouped by aisle.
 */
export function generateShareText(
  listName: string,
  items: Pick<DbGroceryListItem, 'item' | 'quantity' | 'aisle' | 'isChecked'>[],
  recipeCount: number
): string {
  const unchecked = items.filter((i) => i.isChecked === 0);
  const lines: string[] = [
    `🛒 ${listName} (${recipeCount} recipe${recipeCount !== 1 ? 's' : ''})`,
    '',
  ];

  const byAisle = new Map<string, typeof unchecked>();
  for (const item of unchecked) {
    const aisle = item.aisle ?? 'other';
    if (!byAisle.has(aisle)) byAisle.set(aisle, []);
    byAisle.get(aisle)!.push(item);
  }

  for (const [aisle, order] of Object.entries(AISLE_ORDER).sort(([, a], [, b]) => a - b)) {
    void order;
    const group = byAisle.get(aisle);
    if (!group?.length) continue;
    lines.push(`${AISLE_EMOJI[aisle] ?? '🛒'} ${aisle.toUpperCase()}`);
    for (const item of group) {
      const qty = item.quantity ? ` (${item.quantity})` : '';
      lines.push(`☐ ${item.item}${qty}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
