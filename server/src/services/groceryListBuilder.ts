import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { ingredients as ingredientsTable, pantry as pantryTable, type DbGroceryListItem } from '../db/schema.pg';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';
import { UnitFamily, getUnitFamily, toBase, fromBaseTsp, fromBaseG } from '../utils/unitConversion';

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
  produce: 0, dairy: 1, bakery: 2, meat: 3, frozen: 4, spices: 5, pantry: 6, beverages: 7, other: 8,
};

// ── Structural inputs (db-agnostic so the logic is unit-testable) ─────────────

export interface SourcedIngredient {
  item: string;
  quantity: string;
  sourceRecipeId: string;
}

export interface PantryLike {
  item: string;
  quantity: string | null;
  unit: string | null;
  isStaple: boolean;
}

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

// ── Pure consolidation (no DB) ─────────────────────────────────────────────────

/**
 * Consolidate ingredient lines into grocery rows: parse, group by normalised name,
 * sum compatible quantities, optionally subtract pantry, sort by aisle.
 */
export function consolidate(
  allIngredients: SourcedIngredient[],
  pantryItems: PantryLike[],
  subtractPantry: boolean,
): Omit<DbGroceryListItem, 'id' | 'listId'>[] {
  const groups = new Map<string, Consolidated>();
  const TO_TASTE_PATTERNS = ['to taste', 'as needed', 'pinch', 'dash'];

  for (const ing of allIngredients) {
    const quantityLower = (ing.quantity ?? '').toLowerCase();
    const hasToTasteQty = TO_TASTE_PATTERNS.some((p) => quantityLower.includes(p));

    const rawText = ing.quantity && !hasToTasteQty ? `${ing.quantity} ${ing.item}` : ing.item;
    const parsed = parseIngredient(rawText.trim());
    const itemName = parsed.item || ing.item;
    const key = normalizeItemName(itemName);
    const isToTaste =
      hasToTasteQty || (parsed.numericQuantity === null && (parsed.modifier != null || !ing.quantity));
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
      if (isToTaste || existing.isToTaste) {
        existing.isToTaste = true;
      } else if (
        parsed.numericQuantity !== null &&
        parsed.unit &&
        existing.family !== 'other' &&
        family === existing.family
      ) {
        existing.totalBase = (existing.totalBase ?? 0) + toBase(parsed.numericQuantity, parsed.unit);
      } else if (
        parsed.numericQuantity !== null &&
        existing.numericQuantity !== null &&
        existing.unit === parsed.unit
      ) {
        existing.numericQuantity = existing.numericQuantity + parsed.numericQuantity;
      }
    }
  }

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
      isChecked: false,
      sortOrder: 0,
    });
  }

  if (subtractPantry) {
    const pantryMap = new Map<string, PantryLike>();
    for (const p of pantryItems) pantryMap.set(normalizeItemName(p.item), p);

    const kept: typeof rows = [];
    for (const row of rows) {
      const key = normalizeItemName(row.item);
      const pantry = pantryMap.get(key);
      if (!pantry) {
        kept.push(row);
        continue;
      }
      if (pantry.isStaple) continue;

      if (row.numericQuantity !== null && row.unit !== null && pantry.quantity !== null && pantry.unit !== null) {
        const pantryParsed = parseIngredient(`${pantry.quantity} ${pantry.unit} ${pantry.item}`);
        const pantryFamily = getUnitFamily(pantryParsed.unit);
        const rowFamily = getUnitFamily(row.unit);
        if (pantryFamily === rowFamily && rowFamily !== 'other' && pantryParsed.numericQuantity !== null) {
          const neededBase = toBase(row.numericQuantity, row.unit);
          const haveBase = toBase(pantryParsed.numericQuantity, pantryParsed.unit ?? '');
          const remaining = neededBase - haveBase;
          if (remaining <= 0) continue;

          const conv = rowFamily === 'volume' ? fromBaseTsp(remaining) : fromBaseG(remaining);
          row.numericQuantity = conv.qty;
          row.unit = conv.unit;
          row.quantity = `${conv.qty} ${conv.unit}`;
        }
      }
      kept.push(row);
    }
    rows.length = 0;
    rows.push(...kept);
  }

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

// ── DB-backed builder ──────────────────────────────────────────────────────────

/**
 * Build a consolidated grocery list from one or more of the user's recipe IDs.
 * (Caller is responsible for verifying recipe ownership.)
 */
export async function buildListFromRecipes(
  userId: string,
  recipeIds: string[],
  subtractPantry: boolean,
): Promise<Omit<DbGroceryListItem, 'id' | 'listId'>[]> {
  const allIngredients: SourcedIngredient[] = [];
  for (const recipeId of recipeIds) {
    const rows = await db
      .select({ item: ingredientsTable.item, quantity: ingredientsTable.quantity })
      .from(ingredientsTable)
      .where(eq(ingredientsTable.recipeId, recipeId))
      .orderBy(asc(ingredientsTable.sortOrder));
    for (const row of rows) allIngredients.push({ item: row.item, quantity: row.quantity, sourceRecipeId: recipeId });
  }

  const pantryItems: PantryLike[] = subtractPantry
    ? await db
        .select({ item: pantryTable.item, quantity: pantryTable.quantity, unit: pantryTable.unit, isStaple: pantryTable.isStaple })
        .from(pantryTable)
        .where(eq(pantryTable.userId, userId))
    : [];

  return consolidate(allIngredients, pantryItems, subtractPantry);
}

// ── Share text ────────────────────────────────────────────────────────────────

const AISLE_EMOJI: Record<string, string> = {
  produce: '🥬', dairy: '🧀', bakery: '🥖', meat: '🥩', frozen: '🧊', spices: '🌶️', pantry: '🥫', beverages: '🥤', other: '🛒',
};

/** Generate a shareable plain-text version of a grocery list grouped by aisle. */
export function generateShareText(
  listName: string,
  items: Pick<DbGroceryListItem, 'item' | 'quantity' | 'aisle' | 'isChecked'>[],
  recipeCount: number,
): string {
  const unchecked = items.filter((i) => !i.isChecked);
  const lines: string[] = [`🛒 ${listName} (${recipeCount} recipe${recipeCount !== 1 ? 's' : ''})`, ''];

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
