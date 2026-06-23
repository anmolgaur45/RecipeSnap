import { anthropicClient } from './aiClients';
import { z } from 'zod';
import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/client';
import {
  pantry,
  groceryLists,
  groceryListItems,
  recipes,
  ingredients,
  type DbPantryItem,
} from '../db/schema.pg';
import { parseIngredient, classifyAisle } from '../utils/ingredientParser';

const client = anthropicClient();

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
  const diffDays = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'expiring_soon';
  return 'fresh';
}

function withStatus(row: DbPantryItem): PantryItemWithStatus {
  return { ...row, expiryStatus: computeExpiryStatus(row.expiresAt) };
}

const STRIP_WORDS = new Set([
  'finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'lightly',
  'chopped', 'sliced', 'diced', 'minced', 'grated', 'shredded', 'mashed',
  'boiled', 'cooked', 'fried', 'roasted', 'toasted', 'grilled', 'baked',
  'peeled', 'seeded', 'trimmed', 'cleaned', 'sifted', 'blanched',
  'powdered', 'crushed', 'crumbled', 'beaten', 'whisked', 'melted',
  'frozen', 'canned', 'packed', 'drained', 'rinsed', 'soaked', 'fresh',
]);

export function normalizeItemName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((w) => !STRIP_WORDS.has(w))
      .join(' ')
      .trim() || name.toLowerCase().trim()
  );
}

function inferCategory(name: string): string {
  const aisle = classifyAisle(name);
  const MAP: Record<string, string> = {
    produce: 'produce', dairy: 'dairy', bakery: 'bakery', meat: 'meat',
    frozen: 'frozen', spices: 'spices', pantry: 'pantry', beverages: 'beverages', other: 'other',
  };
  return MAP[aisle] ?? 'other';
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** Add a pantry item, merging quantities with an existing item of the same normalised name. */
export async function addItem(userId: string, params: AddItemParams): Promise<PantryItemWithStatus> {
  const normalizedName = normalizeItemName(params.name);
  const displayName = params.displayName ?? params.name;
  const category = params.category ?? inferCategory(normalizedName);

  const existing = (
    await db
      .select()
      .from(pantry)
      .where(and(eq(pantry.userId, userId), eq(pantry.item, normalizedName)))
      .limit(1)
  )[0];

  if (existing) {
    let mergedQty: string | null = existing.quantity;
    if (params.quantity != null && existing.quantity != null && !isNaN(Number(existing.quantity))) {
      mergedQty = String(Number(existing.quantity) + params.quantity);
    } else if (params.quantity != null) {
      mergedQty = String(params.quantity);
    }
    const [updated] = await db
      .update(pantry)
      .set({ quantity: mergedQty, unit: params.unit ?? existing.unit })
      .where(eq(pantry.id, existing.id))
      .returning();
    return withStatus(updated);
  }

  const [created] = await db
    .insert(pantry)
    .values({
      userId,
      item: normalizedName,
      displayName,
      quantity: params.quantity != null ? String(params.quantity) : null,
      unit: params.unit ?? null,
      category,
      expiresAt: params.expiresAt ?? null,
      isStaple: params.isStaple ?? false,
      notes: params.notes ?? null,
    })
    .returning();
  return withStatus(created);
}

/** Update an existing pantry item's fields (scoped to the user). */
export async function updateItem(
  userId: string,
  id: number,
  updates: Partial<Omit<DbPantryItem, 'id' | 'userId' | 'addedAt'>>,
): Promise<PantryItemWithStatus | null> {
  const existing = (
    await db.select().from(pantry).where(and(eq(pantry.id, id), eq(pantry.userId, userId))).limit(1)
  )[0];
  if (!existing) return null;

  const set: Partial<typeof pantry.$inferInsert> = {};
  if (updates.item !== undefined) set.item = updates.item;
  if (updates.displayName !== undefined) set.displayName = updates.displayName;
  if (updates.quantity !== undefined) set.quantity = updates.quantity;
  if (updates.unit !== undefined) set.unit = updates.unit;
  if (updates.category !== undefined) set.category = updates.category;
  if (updates.expiresAt !== undefined) set.expiresAt = updates.expiresAt;
  if (updates.isStaple !== undefined) set.isStaple = updates.isStaple;
  if (updates.notes !== undefined) set.notes = updates.notes;

  if (Object.keys(set).length === 0) return withStatus(existing);

  const [updated] = await db.update(pantry).set(set).where(eq(pantry.id, id)).returning();
  return withStatus(updated);
}

/** Delete a pantry item. Staples require force=true. Scoped to the user. */
export async function deleteItem(
  userId: string,
  id: number,
  force = false,
): Promise<{ deleted: boolean; reason?: string }> {
  const row = (
    await db.select().from(pantry).where(and(eq(pantry.id, id), eq(pantry.userId, userId))).limit(1)
  )[0];
  if (!row) return { deleted: false, reason: 'not_found' };
  if (row.isStaple && !force) return { deleted: false, reason: 'is_staple' };
  await db.delete(pantry).where(eq(pantry.id, id));
  return { deleted: true };
}

/** Return all of the user's pantry items with computed expiry status. */
export async function getAll(userId: string): Promise<PantryItemWithStatus[]> {
  const rows = await db
    .select()
    .from(pantry)
    .where(eq(pantry.userId, userId))
    .orderBy(asc(pantry.category), asc(pantry.item));
  return rows.map(withStatus);
}

/** Return the user's items expiring within 3 days (or already expired). */
export async function getExpiringItems(userId: string): Promise<PantryItemWithStatus[]> {
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select()
    .from(pantry)
    .where(and(eq(pantry.userId, userId), isNotNull(pantry.expiresAt), lte(pantry.expiresAt, threeDaysFromNow)))
    .orderBy(asc(pantry.expiresAt));
  return rows.map(withStatus);
}

// ── Bulk Add ──────────────────────────────────────────────────────────────────

/** Bulk-add all checked items from one of the user's grocery lists to their pantry. */
export async function bulkAddFromGroceryList(userId: string, listId: number): Promise<PantryItemWithStatus[]> {
  const items = await db
    .select({ item: groceryListItems.item, quantity: groceryListItems.quantity, unit: groceryListItems.unit })
    .from(groceryListItems)
    .innerJoin(groceryLists, eq(groceryListItems.listId, groceryLists.id))
    .where(and(eq(groceryListItems.listId, listId), eq(groceryLists.userId, userId), eq(groceryListItems.isChecked, true)));

  const added: PantryItemWithStatus[] = [];
  for (const gi of items) {
    const parsed = parseIngredient(`${gi.quantity ?? ''} ${gi.unit ?? ''} ${gi.item}`.trim());
    added.push(
      await addItem(userId, {
        name: parsed.item || gi.item,
        displayName: gi.item,
        quantity: parsed.numericQuantity,
        unit: parsed.unit ?? gi.unit ?? null,
      }),
    );
  }
  return added;
}

/** Mark a list of ingredient names as pantry staples. */
export async function setupStaples(userId: string, stapleNames: string[]): Promise<PantryItemWithStatus[]> {
  const out: PantryItemWithStatus[] = [];
  for (const name of stapleNames) {
    out.push(await addItem(userId, { name, displayName: name, isStaple: true }));
  }
  return out;
}

// ── Pantry Depletion ──────────────────────────────────────────────────────────

/**
 * Subtract recipe ingredient quantities from the user's pantry after cooking.
 * Staples are never depleted; quantities are clamped at 0.
 */
export async function depletFromRecipe(
  userId: string,
  recipeId: string,
  servings: number,
): Promise<Array<{ item: string; depleted: boolean; reason?: string }>> {
  const recipe = (
    await db
      .select({ servings: recipes.servings })
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId)))
      .limit(1)
  )[0];
  if (!recipe) return [];

  const defaultServings = recipe.servings ? parseInt(recipe.servings, 10) || 1 : 1;
  const scaleFactor = servings / defaultServings;

  const ings = await db
    .select({ item: ingredients.item, numericQuantity: ingredients.numericQuantity })
    .from(ingredients)
    .where(eq(ingredients.recipeId, recipeId));

  const pantryItems = await db.select().from(pantry).where(eq(pantry.userId, userId));
  const pantryMap = new Map<string, DbPantryItem>();
  for (const p of pantryItems) pantryMap.set(normalizeItemName(p.item), p);

  const summary: Array<{ item: string; depleted: boolean; reason?: string }> = [];

  for (const ing of ings) {
    const normalizedIng = normalizeItemName(ing.item);

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
      await db.delete(pantry).where(eq(pantry.id, pantryMatch.id));
    } else {
      await db.update(pantry).set({ quantity: String(remaining) }).where(eq(pantry.id, pantryMatch.id));
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
    }),
  ),
});

/** Parse natural-language grocery text into pantry items (Claude Haiku) and add them. */
export async function quickAddAI(userId: string, text: string): Promise<PantryItemWithStatus[]> {
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

  const out: PantryItemWithStatus[] = [];
  for (const item of parsed.items) {
    out.push(
      await addItem(userId, {
        name: item.name,
        displayName: item.displayName,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
      }),
    );
  }
  return out;
}
