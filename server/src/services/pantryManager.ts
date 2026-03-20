import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db, DbPantryItem } from '../db/schema';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExpiryStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface PantryItemWithStatus extends DbPantryItem {
  expiryStatus: ExpiryStatus;
}

export interface AddItemParams {
  name: string;
  displayName?: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  isStaple?: boolean;
  expiresAt?: string | null;
  notes?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute expiry status from an ISO date string */
export function computeExpiryStatus(expiresAt: string | null): ExpiryStatus {
  if (!expiresAt) return 'fresh';
  const now = new Date();
  const exp = new Date(expiresAt);
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'expiring_soon';
  return 'fresh';
}

/** Attach computed expiryStatus to a DB row */
function withStatus(row: DbPantryItem): PantryItemWithStatus {
  return { ...row, expiryStatus: computeExpiryStatus(row.expiresAt) };
}

/** Strip cooking adjectives and normalise for matching */
const STRIP_WORDS = new Set([
  'finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'lightly',
  'chopped', 'sliced', 'diced', 'minced', 'grated', 'shredded', 'mashed',
  'boiled', 'cooked', 'fried', 'roasted', 'toasted', 'grilled', 'baked',
  'peeled', 'seeded', 'trimmed', 'cleaned', 'sifted', 'blanched',
  'powdered', 'crushed', 'crumbled', 'beaten', 'whisked', 'melted',
  'frozen', 'canned', 'packed', 'drained', 'rinsed', 'soaked', 'fresh',
]);

export function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((w) => !STRIP_WORDS.has(w))
    .join(' ')
    .trim() || name.toLowerCase().trim();
}

/** Auto-classify a pantry item into a category using aisle classifier */
function inferCategory(name: string): string {
  const aisle = classifyAisle(name);
  const MAP: Record<string, string> = {
    produce: 'produce', dairy: 'dairy', bakery: 'bakery', meat: 'meat',
    frozen: 'frozen', spices: 'spices', pantry: 'pantry', beverages: 'beverages', other: 'other',
  };
  return MAP[aisle] ?? 'other';
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Add a pantry item. Merges quantities with an existing item of the same normalised name. */
export function addItem(params: AddItemParams): PantryItemWithStatus {
  const normalizedName = normalizeItemName(params.name);
  const displayName = params.displayName ?? params.name;
  const category = params.category ?? inferCategory(normalizedName);

  const existing = db
    .prepare('SELECT * FROM pantry WHERE lower(trim(item)) = ?')
    .get(normalizedName) as DbPantryItem | undefined;

  if (existing) {
    // Merge quantities when both are numeric
    let mergedQty: string | null = existing.quantity;
    if (params.quantity != null && existing.quantity != null && !isNaN(Number(existing.quantity))) {
      mergedQty = String(Number(existing.quantity) + params.quantity);
    } else if (params.quantity != null) {
      mergedQty = String(params.quantity);
    }

    db.prepare('UPDATE pantry SET quantity = ?, unit = ? WHERE id = ?').run(
      mergedQty,
      params.unit ?? existing.unit,
      existing.id
    );
    return withStatus(db.prepare('SELECT * FROM pantry WHERE id = ?').get(existing.id) as DbPantryItem);
  }

  const result = db
    .prepare(
      `INSERT INTO pantry (item, displayName, quantity, unit, category, expiresAt, isStaple, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalizedName,
      displayName,
      params.quantity != null ? String(params.quantity) : null,
      params.unit ?? null,
      category,
      params.expiresAt ?? null,
      params.isStaple ? 1 : 0,
      params.notes ?? null
    );
  return withStatus(db.prepare('SELECT * FROM pantry WHERE id = ?').get(result.lastInsertRowid) as DbPantryItem);
}

/** Update an existing pantry item's fields. */
export function updateItem(
  id: number,
  updates: Partial<Omit<DbPantryItem, 'id' | 'addedAt'>>
): PantryItemWithStatus | null {
  const existing = db.prepare('SELECT * FROM pantry WHERE id = ?').get(id) as DbPantryItem | undefined;
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.item !== undefined)        { fields.push('item = ?');        values.push(updates.item); }
  if (updates.displayName !== undefined) { fields.push('displayName = ?'); values.push(updates.displayName); }
  if (updates.quantity !== undefined)    { fields.push('quantity = ?');    values.push(updates.quantity); }
  if (updates.unit !== undefined)        { fields.push('unit = ?');        values.push(updates.unit); }
  if (updates.category !== undefined)    { fields.push('category = ?');    values.push(updates.category); }
  if (updates.expiresAt !== undefined)   { fields.push('expiresAt = ?');   values.push(updates.expiresAt); }
  if (updates.isStaple !== undefined)    { fields.push('isStaple = ?');    values.push(updates.isStaple ? 1 : 0); }
  if (updates.notes !== undefined)       { fields.push('notes = ?');       values.push(updates.notes); }

  if (fields.length === 0) return withStatus(existing);

  values.push(id);
  db.prepare(`UPDATE pantry SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return withStatus(db.prepare('SELECT * FROM pantry WHERE id = ?').get(id) as DbPantryItem);
}

/** Delete a pantry item. Staples require force=true. */
export function deleteItem(id: number, force = false): { deleted: boolean; reason?: string } {
  const row = db.prepare('SELECT * FROM pantry WHERE id = ?').get(id) as DbPantryItem | undefined;
  if (!row) return { deleted: false, reason: 'not_found' };
  if (row.isStaple && !force) return { deleted: false, reason: 'is_staple' };
  db.prepare('DELETE FROM pantry WHERE id = ?').run(id);
  return { deleted: true };
}

/** Return all pantry items with computed expiry status. */
export function getAll(): PantryItemWithStatus[] {
  const rows = db.prepare('SELECT * FROM pantry ORDER BY category ASC, item ASC').all() as DbPantryItem[];
  return rows.map(withStatus);
}

/** Return items expiring within 3 days (or already expired). */
export function getExpiringItems(): PantryItemWithStatus[] {
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare('SELECT * FROM pantry WHERE expiresAt IS NOT NULL AND expiresAt <= ? ORDER BY expiresAt ASC')
    .all(threeDaysFromNow) as DbPantryItem[];
  return rows.map(withStatus);
}

// ── Bulk Add ──────────────────────────────────────────────────────────────────

/** Bulk-add all checked items from a grocery list to the pantry. */
export function bulkAddFromGroceryList(listId: number): PantryItemWithStatus[] {
  const items = db
    .prepare('SELECT * FROM grocery_list_items WHERE listId = ? AND isChecked = 1')
    .all(listId) as Array<{ item: string; quantity: string | null; unit: string | null }>;

  const added: PantryItemWithStatus[] = [];
  for (const gi of items) {
    const parsed = parseIngredient(
      `${gi.quantity ?? ''} ${gi.unit ?? ''} ${gi.item}`.trim()
    );
    added.push(addItem({
      name: parsed.item || gi.item,
      displayName: gi.item,
      quantity: parsed.numericQuantity,
      unit: parsed.unit ?? gi.unit ?? null,
    }));
  }
  return added;
}

/** Mark a list of ingredient names as pantry staples. */
export function setupStaples(stapleNames: string[]): PantryItemWithStatus[] {
  return stapleNames.map((name) => addItem({ name, displayName: name, isStaple: true }));
}

// ── Pantry Depletion ──────────────────────────────────────────────────────────

/**
 * Subtract recipe ingredient quantities from the pantry after cooking.
 * - Staples are never depleted.
 * - Quantities are clamped at 0 (never negative).
 */
export function depletFromRecipe(
  recipeId: string,
  servings: number
): Array<{ item: string; depleted: boolean; reason?: string }> {
  const recipe = db
    .prepare('SELECT servings FROM recipes WHERE id = ?')
    .get(recipeId) as { servings: string | null } | undefined;
  const defaultServings = recipe?.servings ? parseInt(recipe.servings, 10) || 1 : 1;
  const scaleFactor = servings / defaultServings;

  const ingredients = db
    .prepare('SELECT item, numericQuantity FROM ingredients WHERE recipeId = ?')
    .all(recipeId) as Array<{ item: string; numericQuantity: number | null }>;

  const pantryItems = db.prepare('SELECT * FROM pantry').all() as DbPantryItem[];
  const pantryMap = new Map<string, DbPantryItem>();
  for (const p of pantryItems) {
    pantryMap.set(normalizeItemName(p.item), p);
  }

  const summary: Array<{ item: string; depleted: boolean; reason?: string }> = [];

  for (const ing of ingredients) {
    const normalizedIng = normalizeItemName(ing.item);

    // Fuzzy match: exact, or one contains the other
    let pantryMatch: DbPantryItem | undefined;
    for (const [key, pItem] of pantryMap) {
      if (normalizedIng === key || normalizedIng.includes(key) || key.includes(normalizedIng)) {
        pantryMatch = pItem;
        break;
      }
    }

    if (!pantryMatch) { summary.push({ item: ing.item, depleted: false, reason: 'not_in_pantry' }); continue; }
    if (pantryMatch.isStaple) { summary.push({ item: ing.item, depleted: false, reason: 'is_staple' }); continue; }

    const pantryQty = pantryMatch.quantity != null ? parseFloat(pantryMatch.quantity) : null;
    if (pantryQty === null || isNaN(pantryQty)) {
      summary.push({ item: ing.item, depleted: false, reason: 'no_quantity' });
      continue;
    }

    const usedQty = (ing.numericQuantity ?? 1) * scaleFactor;
    const remaining = Math.max(0, pantryQty - usedQty);

    if (remaining === 0) {
      db.prepare('DELETE FROM pantry WHERE id = ?').run(pantryMatch.id);
    } else {
      db.prepare('UPDATE pantry SET quantity = ? WHERE id = ?').run(String(remaining), pantryMatch.id);
    }
    summary.push({ item: ing.item, depleted: true });
  }

  return summary;
}

// ── AI Quick-Add ──────────────────────────────────────────────────────────────

const QuickAddSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      displayName: z.string(),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      category: z.string(),
    })
  ),
});

/** Parse a natural-language grocery text into pantry items using Claude Haiku. */
export async function quickAddAI(text: string): Promise<PantryItemWithStatus[]> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Parse this grocery/pantry text into structured items. Return ONLY valid JSON with no markdown:
${text}

JSON format:
{
  "items": [
    { "name": "chicken breast", "displayName": "Chicken Breast", "quantity": null, "unit": null, "category": "meat" },
    { "name": "rice", "displayName": "Rice", "quantity": 2, "unit": "cup", "category": "pantry" }
  ]
}

Categories: produce, dairy, meat, bakery, frozen, spices, pantry, beverages, other.
Use singular normalized names for "name" (lowercase). Keep user-friendly form for "displayName".
If quantity not specified, set null. Return only the JSON object.`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from AI');

  const jsonText = textBlock.text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = QuickAddSchema.parse(JSON.parse(jsonText));

  return parsed.items.map((item) =>
    addItem({
      name: item.name,
      displayName: item.displayName,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    })
  );
}
