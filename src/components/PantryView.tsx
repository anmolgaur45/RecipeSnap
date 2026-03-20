import {
  View, Text, TextInput, Pressable, SectionList,
  Alert, ActivityIndicator, StyleSheet, ScrollView, Animated,
} from 'react-native';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePantryStore } from '@/store/pantryStore';
import { PantryItemRow } from './PantryItemRow';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';
import { INGREDIENT_SUGGESTIONS } from '@/constants/ingredientSuggestions';
import type { PantryItem } from '@/store/types';

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  produce: '🥬', dairy: '🧀', meat: '🥩', bakery: '🍞',
  frozen: '🧊', spices: '🌶️', pantry: '🥫', beverages: '🥤', other: '🛒',
};

function guessCategoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (/chicken|beef|lamb|pork|steak|salmon|tuna|shrimp|meat|ground/.test(n)) return '🥩';
  if (/milk|cheese|butter|yogurt|cream|ghee|paneer|mozzarella|parmesan/.test(n)) return '🧀';
  if (/rice|flour|pasta|bread|oats|noodles|semolina|poha|sooji|quinoa|couscous|cornmeal/.test(n)) return '🍞';
  if (/tomato|onion|garlic|potato|spinach|carrot|capsicum|mushroom|lemon|lime|ginger|coriander|mint|cucumber|eggplant|cauliflower|broccoli|cabbage/.test(n)) return '🥬';
  if (/cumin|turmeric|pepper|chili|garam|masala|cardamom|cinnamon|clove|mustard|fennel|fenugreek|paprika|oregano|thyme|basil|rosemary|bay/.test(n)) return '🌶️';
  if (/oil|sugar|salt|honey|vinegar|sauce|ketchup|soy|coconut|baking|jaggery|maple|cornstarch/.test(n)) return '🥫';
  if (/egg/.test(n)) return '🥚';
  return '🛒';
}

const CATEGORY_ORDER = ['produce', 'dairy', 'meat', 'bakery', 'frozen', 'spices', 'pantry', 'beverages', 'other'];

const DEFAULT_STAPLES = [
  'Salt', 'Black Pepper', 'Olive Oil', 'Vegetable Oil', 'Sugar',
  'Flour', 'Butter', 'Garlic', 'Onions', 'Soy Sauce', 'Vinegar', 'Baking Powder',
];

// ── Staple onboarding sheet content ───────────────────────────────────────────

function StapleOnboardingContent({ onDone }: { onDone: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['Salt', 'Black Pepper', 'Olive Oil', 'Sugar']));
  const setupStaples = usePantryStore((s) => s.setupStaples);
  const [saving, setSaving] = useState(false);

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleDone = async () => {
    if (selected.size === 0) { onDone(); return; }
    setSaving(true);
    try { await setupStaples([...selected]); } catch {}
    setSaving(false);
    onDone();
  };

  return (
    <View style={ss.sheetContent}>
      <View style={ss.handle} />
      <Text style={ss.sheetTitle}>📌 Set up your staples</Text>
      <Text style={ss.sheetSubtitle}>Items you always have — never auto-removed from your pantry.</Text>
      <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 4 }}>
        {DEFAULT_STAPLES.map((name) => (
          <Pressable
            key={name}
            onPress={() => toggle(name)}
            style={[ss.stapleChip, selected.has(name) && ss.stapleChipActive]}
          >
            <Text style={[ss.stapleChipText, selected.has(name) && ss.stapleChipTextActive]}>
              {selected.has(name) ? '✓ ' : ''}{name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable onPress={handleDone} style={ss.doneBtn} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={ss.doneBtnText}>Add {selected.size} staples</Text>}
      </Pressable>
    </View>
  );
}

// ── Edit item sheet content ────────────────────────────────────────────────────

function EditItemContent({ item, onClose }: { item: PantryItem; onClose: () => void }) {
  const updateItem = usePantryStore((s) => s.updateItem);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [expiresAt, setExpiresAt] = useState(item.expiresAt ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateItem(item.id, { notes: notes.trim() || null, expiresAt: expiresAt.trim() || null });
    } catch {}
    setSaving(false);
    onClose();
  };

  return (
    <View style={ss.sheetContent}>
      <View style={ss.handle} />
      <Text style={ss.sheetTitle}>Edit {item.displayName ?? item.item}</Text>
      <Text style={ss.label}>Expiry date (YYYY-MM-DD)</Text>
      <TextInput
        style={ss.input}
        value={expiresAt}
        onChangeText={setExpiresAt}
        placeholder="e.g. 2026-03-25"
        placeholderTextColor={Colors.textMuted}
      />
      <Text style={ss.label}>Notes</Text>
      <TextInput
        style={ss.input}
        value={notes}
        onChangeText={setNotes}
        placeholder="half used, frozen..."
        placeholderTextColor={Colors.textMuted}
      />
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <Pressable onPress={onClose} style={[ss.doneBtn, { flex: 1, backgroundColor: Colors.border }]}>
          <Text style={[ss.doneBtnText, { color: Colors.textPrimary }]}>Cancel</Text>
        </Pressable>
        <Pressable onPress={handleSave} style={[ss.doneBtn, { flex: 1 }]} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={ss.doneBtnText}>Save</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ── Main PantryView ────────────────────────────────────────────────────────────

export function PantryView() {
  const insets = useSafeAreaInsets();
  const { items, isLoading, fetchPantry, deleteItem, quickAdd, addItem, getExpiringItems } = usePantryStore();
  const [quickAddText, setQuickAddText] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const editAnim = useRef(new Animated.Value(600)).current;
  const onboardingAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => { void fetchPantry(); }, []);

  const openEdit = useCallback((item: PantryItem) => {
    setEditingItem(item);
    editAnim.setValue(600);
    Animated.spring(editAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
  }, [editAnim]);

  const closeEdit = useCallback(() => {
    Animated.timing(editAnim, { toValue: 600, duration: 220, useNativeDriver: true })
      .start(() => setEditingItem(null));
  }, [editAnim]);

  const openOnboarding = useCallback(() => {
    setShowOnboarding(true);
    onboardingAnim.setValue(600);
    Animated.spring(onboardingAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
  }, [onboardingAnim]);

  const closeOnboarding = useCallback(() => {
    Animated.timing(onboardingAnim, { toValue: 600, duration: 220, useNativeDriver: true })
      .start(() => setShowOnboarding(false));
  }, [onboardingAnim]);

  const expiringItems = getExpiringItems();
  const expiredCount = expiringItems.filter((i) => i.expiryStatus === 'expired').length;
  const expiringSoonCount = expiringItems.filter((i) => i.expiryStatus === 'expiring_soon').length;

  // ── Autocomplete suggestions ─────────────────────────────────────────────────
  useEffect(() => {
    const query = quickAddText.trim().toLowerCase();
    if (query.length < 2) { setSuggestions([]); return; }

    const startsWith = INGREDIENT_SUGGESTIONS.filter((s) =>
      s.toLowerCase().startsWith(query)
    );
    const contains = INGREDIENT_SUGGESTIONS.filter((s) =>
      !s.toLowerCase().startsWith(query) && s.toLowerCase().includes(query)
    );
    // Also surface matching names already in the user's pantry
    const pantryNames = items
      .map((i) => i.displayName ?? i.item)
      .filter((name) => {
        const lc = name.toLowerCase();
        return (
          lc.includes(query) &&
          !startsWith.some((s) => s.toLowerCase() === lc) &&
          !contains.some((s) => s.toLowerCase() === lc)
        );
      });

    setSuggestions([...startsWith, ...contains, ...pantryNames].slice(0, 6));
  }, [quickAddText, items]);

  const handleQuickAdd = async () => {
    if (!quickAddText.trim()) return;
    setSuggestions([]);
    setIsQuickAdding(true);
    try {
      await quickAdd(quickAddText.trim());
      setQuickAddText('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Could not add items', (e as Error).message);
    } finally {
      setIsQuickAdding(false);
    }
  };

  const sections = useMemo(() => {
    const staples = items.filter((i) => i.isStaple);
    const nonStaples = items.filter((i) => !i.isStaple);

    const grouped = new Map<string, PantryItem[]>();
    for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
    for (const item of nonStaples) {
      const cat = item.category ?? 'other';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(item);
    }

    const result: Array<{ title: string; emoji: string; data: PantryItem[] }> = [];
    if (staples.length > 0) result.push({ title: 'Staples', emoji: '📌', data: staples });
    for (const cat of CATEGORY_ORDER) {
      const catItems = grouped.get(cat) ?? [];
      if (catItems.length > 0) {
        result.push({
          title: cat.charAt(0).toUpperCase() + cat.slice(1),
          emoji: CATEGORY_EMOJI[cat] ?? '🛒',
          data: catItems,
        });
      }
    }
    return result;
  }, [items]);

  if (isLoading && items.length === 0) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Quick-add bar */}
      <View style={styles.quickAddBar}>
        <TextInput
          style={styles.quickAddInput}
          value={quickAddText}
          onChangeText={setQuickAddText}
          placeholder="Add items... (e.g. eggs, 2 cups rice, milk)"
          placeholderTextColor={Colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={handleQuickAdd}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          editable={!isQuickAdding}
        />
        <Pressable
          onPress={handleQuickAdd}
          style={[styles.quickAddBtn, (!quickAddText.trim() || isQuickAdding) && styles.quickAddBtnDisabled]}
          disabled={!quickAddText.trim() || isQuickAdding}
        >
          {isQuickAdding
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.quickAddBtnText}>Add</Text>}
        </Pressable>
      </View>

      {/* Suggestion list — inline flow, no z-index issues */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionList}>
          {suggestions.map((s, idx) => (
            <Pressable
              key={s}
              style={({ pressed }) => [
                styles.suggestionItem,
                pressed && styles.suggestionItemPressed,
                idx === suggestions.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => {
                setSuggestions([]);
                setQuickAddText('');
                // Use addItem (direct DB insert, no AI) for instant optimistic add
                void addItem({ name: s, displayName: s })
                  .then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
                  .catch((e: Error) => Alert.alert('Could not add item', e.message));
              }}
            >
              <View style={styles.suggestionItemInner}>
                <View style={styles.suggestionEmojiBox}>
                  <Text style={styles.suggestionEmoji}>{guessCategoryEmoji(s)}</Text>
                </View>
                <Text style={styles.suggestionItemText}>{s}</Text>
                <Text style={styles.suggestionPlus}>+</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Expiry banners */}
      {expiredCount > 0 && (
        <View style={[styles.expiryBanner, { backgroundColor: `${Colors.error}15` }]}>
          <Text style={styles.expiryBannerText}>🚨 {expiredCount} item{expiredCount > 1 ? 's' : ''} expired</Text>
        </View>
      )}
      {expiringSoonCount > 0 && (
        <Pressable style={[styles.expiryBanner, { backgroundColor: `${Colors.warning}15` }]} onPress={() => router.push('/recommendations')}>
          <Text style={styles.expiryBannerText}>🕐 {expiringSoonCount} expiring soon — tap to see recipes</Text>
        </Pressable>
      )}

      {/* Items list or empty state */}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🧊</Text>
          <Text style={styles.emptyTitle}>Your pantry is empty</Text>
          <Text style={styles.emptySubtitle}>Type ingredients above or set up your staples to get started.</Text>
          <Pressable onPress={openOnboarding} style={styles.setupBtn}>
            <Text style={styles.setupBtnText}>Add Common Staples</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.emoji} {section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <PantryItemRow
              item={item}
              onDelete={() => { void deleteItem(item.id, item.isStaple); }}
              onEdit={() => openEdit(item)}
            />
          )}
          ListFooterComponent={
            <Pressable style={styles.cookFab} onPress={() => router.push('/recommendations')}>
              <Text style={styles.cookFabText}>🍳 What Can I Cook?</Text>
            </Pressable>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled
        />
      )}

      {/* ── Staple Onboarding Overlay (inline — stays above tab bar) ── */}
      {showOnboarding && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeOnboarding}
          />
          <Animated.View style={[ss.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: onboardingAnim }] }]}>
            <StapleOnboardingContent onDone={closeOnboarding} />
          </Animated.View>
        </View>
      )}

      {/* ── Edit Item Overlay (inline — stays above tab bar) ── */}
      {editingItem && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeEdit}
          />
          <Animated.View style={[ss.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: editAnim }] }]}>
            <EditItemContent item={editingItem} onClose={closeEdit} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  quickAddBar: {
    flexDirection: 'row', gap: 8, padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  suggestionList: {
    marginHorizontal: Spacing.md,
    marginTop: 4,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
  },
  suggestionItem: {
    paddingVertical: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  suggestionItemPressed: {
    backgroundColor: `${Colors.primary}0C`,
  },
  suggestionItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  suggestionEmojiBox: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionEmoji: {
    fontSize: 16,
  },
  suggestionItemText: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  suggestionPlus: {
    fontSize: 20,
    color: Colors.primary,
    fontWeight: '300',
    marginLeft: Spacing.sm,
  },
  quickAddInput: {
    flex: 1, height: 42, borderRadius: 10, paddingHorizontal: 12,
    backgroundColor: Colors.background, color: Colors.textPrimary,
    fontSize: 14, borderWidth: 1, borderColor: Colors.border,
  },
  quickAddBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center',
  },
  quickAddBtnDisabled: { opacity: 0.5 },
  quickAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  expiryBanner: {
    marginHorizontal: Spacing.md, marginTop: Spacing.sm,
    borderRadius: 10, padding: 10,
  },
  expiryBannerText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 21, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  setupBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  setupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 8, backgroundColor: Colors.background,
  },
  sectionHeaderText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  cookFab: {
    margin: Spacing.md, backgroundColor: Colors.primary,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  cookFabText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

const ss = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetContent: {
    padding: 24,
    paddingTop: 16,
    gap: 12,
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2,
    alignSelf: 'center', marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  sheetSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  stapleChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  stapleChipActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}18` },
  stapleChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  stapleChipTextActive: { color: Colors.primary },
  doneBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary,
  },
});
