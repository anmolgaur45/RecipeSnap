import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  Alert,
  Share,
  TextInput,
  RefreshControl,
  StyleSheet,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useGroceryStore } from '@/store/groceryStore';
import { useRecipeStore } from '@/store/recipeStore';
import { Colors, Spacing } from '@/constants/theme';
import type { GroceryListItem, GroceryList } from '@/store/types';

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

function GroceryRowSkeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', gap: 12 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#E5E7EB' }} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ height: 14, borderRadius: 7, backgroundColor: '#E5E7EB', width: '70%' }} />
        <View style={{ height: 11, borderRadius: 6, backgroundColor: '#E5E7EB', width: '40%' }} />
      </View>
      <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB' }} />
    </Animated.View>
  );
}

function GroceryLoadingSkeleton() {
  return (
    <View>
      {/* Section header skeleton */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F8F7F4' }}>
        <View style={{ height: 10, width: 80, borderRadius: 5, backgroundColor: '#E5E7EB' }} />
      </View>
      {[1, 2, 3].map((i) => <GroceryRowSkeleton key={i} />)}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F8F7F4', marginTop: 8 }}>
        <View style={{ height: 10, width: 60, borderRadius: 5, backgroundColor: '#E5E7EB' }} />
      </View>
      {[4, 5].map((i) => <GroceryRowSkeleton key={i} />)}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: GroceryListItem;
  listId: number;
  recipeNames: Record<string, string>;
  onToggle: () => void;
  onDelete: () => void;
}

function ItemRow({ item, recipeNames, onToggle, onDelete }: ItemRowProps) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <Pressable
      onPress={() => {
        swipeRef.current?.close();
        onDelete();
      }}
      style={styles.swipeDelete}
    >
      <Text style={styles.swipeDeleteText}>Delete</Text>
    </Pressable>
  );

  const recipeTags = item.recipeIds
    .slice(0, 2)
    .map((id) => recipeNames[id])
    .filter(Boolean);

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        style={[styles.itemRow, !!item.isChecked && styles.itemRowChecked]}
      >
        {/* Checkbox */}
        <View style={[styles.checkbox, !!item.isChecked && styles.checkboxChecked]}>
          {!!item.isChecked && <Text style={styles.checkmark}>✓</Text>}
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          <View style={styles.itemTopRow}>
            <Text
              style={[styles.itemName, !!item.isChecked && styles.itemNameChecked]}
              numberOfLines={1}
            >
              {item.item}
            </Text>
            {item.quantity ? (
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyText}>{item.quantity}</Text>
              </View>
            ) : null}
          </View>
          {recipeTags.length > 0 && (
            <View style={styles.recipeTags}>
              {recipeTags.map((name, i) => (
                <View key={i} style={styles.recipeTag}>
                  <Text style={styles.recipeTagText} numberOfLines={1}>
                    {name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Pressable>
    </Swipeable>
  );
}

// ── Add Item Sheet content ────────────────────────────────────────────────────

interface AddItemSheetProps {
  onClose: () => void;
  onAdd: (text: string) => void;
}

function AddItemSheet({ onClose, onAdd }: AddItemSheetProps) {
  const [text, setText] = useState('');

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
    onClose();
  };

  return (
    <View style={ss.sheetContent}>
      <View style={ss.handle} />
      <Text style={ss.sheetTitle}>Add item</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="e.g. 2 cups flour, garlic..."
        placeholderTextColor={Colors.textMuted}
        style={styles.addItemInput}
        autoFocus
        onSubmitEditing={handleAdd}
        returnKeyType="done"
      />
      <View style={styles.addItemButtons}>
        <Pressable onPress={onClose} style={styles.addItemCancel}>
          <Text style={{ color: Colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleAdd}
          style={[styles.addItemConfirm, !text.trim() && { opacity: 0.4 }]}
          disabled={!text.trim()}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Generate List Sheet content ───────────────────────────────────────────────

interface GenerateListSheetProps {
  onClose: () => void;
}

function GenerateListSheet({ onClose }: GenerateListSheetProps) {
  const { recipes } = useRecipeStore();
  const { createList } = useGroceryStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subtractPantry, setSubtractPantry] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await createList({ recipeIds: [...selected], subtractPantry });
      onClose();
      setSelected(new Set());
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[ss.sheetContent, { maxHeight: '70%' }]}>
      <View style={ss.handle} />
      <Text style={ss.sheetTitle}>Generate Grocery List</Text>
      <Text style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 4 }}>
        Select recipes to include:
      </Text>

      <SectionList
        sections={[{ title: '', data: recipes }]}
        keyExtractor={(r) => r.id}
        renderItem={({ item: recipe }) => (
          <Pressable
            onPress={() => toggle(recipe.id)}
            style={styles.recipeSelectRow}
          >
            <View style={[styles.recipeSelectCheck, selected.has(recipe.id) && styles.recipeSelectCheckOn]}>
              {selected.has(recipe.id) && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
            </View>
            <Text style={styles.recipeSelectName} numberOfLines={1}>{recipe.title}</Text>
          </Pressable>
        )}
        renderSectionHeader={() => null}
        style={{ maxHeight: 240 }}
      />

      <Pressable
        onPress={() => setSubtractPantry(!subtractPantry)}
        style={styles.toggleRow}
      >
        <Text style={{ fontSize: 14, color: Colors.textPrimary }}>Exclude pantry items</Text>
        <View style={[styles.toggle, subtractPantry && styles.toggleOn]}>
          <View style={[styles.toggleThumb, subtractPantry && styles.toggleThumbOn]} />
        </View>
      </Pressable>

      <View style={styles.addItemButtons}>
        <Pressable onPress={onClose} style={styles.addItemCancel}>
          <Text style={{ color: Colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => { void handleGenerate(); }}
          style={[styles.addItemConfirm, (selected.size === 0 || loading) && { opacity: 0.4 }]}
          disabled={selected.size === 0 || loading}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {loading ? 'Building...' : `Generate (${selected.size})`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function GroceryScreen() {
  const insets = useSafeAreaInsets();
  const { activeList, lists, isLoading, fetchLists, toggleItem, addItem, deleteItem, archiveList, shareText } =
    useGroceryStore();
  const { recipes } = useRecipeStore();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showGenerateSheet, setShowGenerateSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const addAnim = useRef(new Animated.Value(600)).current;
  const generateAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    void fetchLists();
  }, []);

  const openAdd = useCallback(() => {
    setShowAddSheet(true);
    addAnim.setValue(600);
    Animated.spring(addAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
  }, [addAnim]);

  const closeAdd = useCallback(() => {
    Animated.timing(addAnim, { toValue: 600, duration: 220, useNativeDriver: true })
      .start(() => setShowAddSheet(false));
  }, [addAnim]);

  const openGenerate = useCallback(() => {
    setShowGenerateSheet(true);
    generateAnim.setValue(600);
    Animated.spring(generateAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
  }, [generateAnim]);

  const closeGenerate = useCallback(() => {
    Animated.timing(generateAnim, { toValue: 600, duration: 220, useNativeDriver: true })
      .start(() => setShowGenerateSheet(false));
  }, [generateAnim]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLists();
    setRefreshing(false);
  }, [fetchLists]);

  // Build a recipeId → title lookup for item tags
  const recipeNames: Record<string, string> = {};
  for (const r of recipes) recipeNames[r.id] = r.title;

  const handleShare = async () => {
    if (!activeList) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const text = await shareText(activeList.id);
      await Share.share({ message: text });
    } catch (_e) {
      // ignore user cancel
    }
  };

  const handleArchive = () => {
    if (!activeList) return;
    Alert.alert('Archive List', 'Mark this list as done?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void archiveList(activeList.id);
        },
      },
    ]);
  };

  const handleAddItem = async (text: string) => {
    if (!activeList) return;
    try {
      await addItem(activeList.id, text);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  };

  const handleDeleteItem = (itemId: number) => {
    if (!activeList) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void deleteItem(activeList.id, itemId);
  };

  // ── Sections: unchecked + "Got it" (checked) ────────────────────────────────
  type Section = { title: string; data: GroceryListItem[]; isCheckedSection?: boolean };

  let sections: Section[] = [];
  if (activeList?.aisles) {
    const uncheckedSections: Section[] = activeList.aisles
      .map((a) => ({
        title: `${AISLE_EMOJI[a.aisle] ?? '🛒'} ${a.aisle.toUpperCase()}`,
        data: a.items.filter((i) => !i.isChecked),
      }))
      .filter((s) => s.data.length > 0);

    const checkedItems = (activeList.items ?? []).filter((i) => i.isChecked);
    const checkedSection: Section[] =
      checkedItems.length > 0
        ? [{ title: `✓ Got it (${checkedItems.length})`, data: checkedItems, isCheckedSection: true }]
        : [];

    sections = [...uncheckedSections, ...checkedSection];
  }

  const progress = activeList?.progress;
  const progressPct = progress && progress.total > 0 ? progress.checked / progress.total : 0;

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (isLoading && !activeList) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🛒 Grocery</Text>
        </View>
        <GroceryLoadingSkeleton />
      </View>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!activeList && !isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🛒 Grocery</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛒</Text>
          <Text style={styles.emptyTitle}>No grocery list yet</Text>
          <Text style={styles.emptySubtitle}>
            Add recipes to your meal plan, then generate a grocery list with one tap.
          </Text>
          {recipes.length > 0 ? (
            <Pressable
              onPress={openGenerate}
              style={styles.emptyAction}
            >
              <Text style={styles.emptyActionText}>Generate from saved recipes</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>Browse Recipes →</Text>
            </Pressable>
          )}
        </View>

        {/* Generate list overlay for empty state */}
        {showGenerateSheet && (
          <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
            <Pressable
              style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={closeGenerate}
            />
            <Animated.View style={[ss.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: generateAnim }] }]}>
              <GenerateListSheet onClose={closeGenerate} />
            </Animated.View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛒 {activeList?.name ?? 'Grocery'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => { void handleShare(); }} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Share</Text>
          </Pressable>
          <Pressable onPress={handleArchive} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Done ✓</Text>
          </Pressable>
        </View>
      </View>

      {/* Progress bar */}
      {progress && progress.total > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {progress.checked} of {progress.total} items
          </Text>
        </View>
      )}

      {/* List selector bar (if multiple active lists) */}
      {lists.filter((l) => l.isActive).length > 1 && (
        <View style={styles.listSelector}>
          {lists.filter((l) => l.isActive).map((l: GroceryList) => (
            <Pressable
              key={l.id}
              onPress={() => useGroceryStore.getState().loadList(l.id)}
              style={[styles.listSelectorChip, l.id === activeList?.id && styles.listSelectorChipActive]}
            >
              <Text
                style={[styles.listSelectorText, l.id === activeList?.id && styles.listSelectorTextActive]}
                numberOfLines={1}
              >
                {l.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Items grouped by aisle */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            listId={activeList!.id}
            recipeNames={recipeNames}
            onToggle={() => void toggleItem(activeList!.id, item.id, item.isChecked)}
            onDelete={() => handleDeleteItem(item.id)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh(); }} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: Colors.textMuted, fontSize: 14 }}>All items checked! 🎉</Text>
            </View>
          )
        }
      />

      {/* FAB — Add item */}
      <Pressable
        onPress={openAdd}
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {/* New list button */}
      <Pressable
        onPress={openGenerate}
        style={[styles.newListBtn, { bottom: insets.bottom + 16 }]}
      >
        <Text style={styles.newListBtnText}>+ New list</Text>
      </Pressable>

      {/* ── Add Item Overlay (inline — stays above tab bar) ── */}
      {showAddSheet && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeAdd}
          />
          <Animated.View style={[ss.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: addAnim }] }]}>
            <AddItemSheet onClose={closeAdd} onAdd={(text) => { void handleAddItem(text); }} />
          </Animated.View>
        </View>
      )}

      {/* ── Generate List Overlay (inline — stays above tab bar) ── */}
      {showGenerateSheet && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeGenerate}
          />
          <Animated.View style={[ss.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: generateAnim }] }]}>
            <GenerateListSheet onClose={closeGenerate} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: 20,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  progressContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  listSelector: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Colors.surface,
  },
  listSelectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: Colors.background,
    maxWidth: 120,
  },
  listSelectorChipActive: {
    backgroundColor: `${Colors.primary}18`,
  },
  listSelectorText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  listSelectorTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  itemRowChecked: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    fontSize: 15,
    color: Colors.textPrimary,
    flex: 1,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  qtyBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  qtyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  recipeTags: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  recipeTag: {
    backgroundColor: `${Colors.primary}10`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    maxWidth: 120,
  },
  recipeTagText: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '500',
  },
  swipeDelete: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeDeleteText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: Spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
  },
  newListBtn: {
    position: 'absolute',
    left: Spacing.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  newListBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Sheet styles
  addItemInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  addItemButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  addItemCancel: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addItemConfirm: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // Generate list sheet
  recipeSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  recipeSelectCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeSelectCheckOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  recipeSelectName: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.border,
    padding: 2,
  },
  toggleOn: {
    backgroundColor: Colors.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleThumbOn: {
    transform: [{ translateX: 18 }],
  },
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
    gap: 16,
  },
  handle: {
    width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2,
    alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
