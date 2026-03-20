import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Animated,
  FlatList,
  ActivityIndicator,
  StatusBar,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMealPlanStore } from '@/store/mealPlanStore';
import { useRecipeStore } from '@/store/recipeStore';
import { MealPlanCalendar } from '@/components/MealPlanCalendar';
import { DayNutritionBar } from '@/components/DayNutritionBar';
import { getDayNutrition } from '@/services/mealPlan';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import type { MealSlot, MealPlanEntry, DayNutrition, Recipe } from '@/store/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the Monday of the week for a given date */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function formatDayHeader(dateStr: string): { dayName: string; dayNum: string; monthStr: string } {
  const d = new Date(dateStr);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dayName: dayNames[d.getDay()],
    dayNum: String(d.getDate()),
    monthStr: monthNames[d.getMonth()],
  };
}

function formatSheetDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
}

const MEAL_SLOTS: { slot: MealSlot; label: string; emoji: string }[] = [
  { slot: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { slot: 'morning_snack', label: 'Morning snack', emoji: '🍎' },
  { slot: 'lunch', label: 'Lunch', emoji: '☀️' },
  { slot: 'evening_snack', label: 'Evening snack', emoji: '🫐' },
  { slot: 'dinner', label: 'Dinner', emoji: '🌙' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: MealPlanEntry;
  onRemove: () => void;
  onMarkCooked: () => void;
}

function EntryCard({ entry, onRemove, onMarkCooked }: EntryCardProps) {
  const isCooked = entry.isCooked;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isCooked ? '#F0FDF4' : Colors.surface,
        borderRadius: BorderRadius.sm,
        padding: 10,
        marginTop: 6,
        borderWidth: 1,
        borderColor: isCooked ? '#86EFAC' : Colors.border,
        ...Shadow.sm,
      }}
    >
      {/* Cook status dot */}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: isCooked ? Colors.success : Colors.border,
          marginRight: 8,
          flexShrink: 0,
        }}
      />

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: isCooked ? Colors.textSecondary : Colors.textPrimary,
            textDecorationLine: isCooked ? 'line-through' : 'none',
          }}
          numberOfLines={1}
        >
          {(entry as any).recipeTitle ?? 'Recipe'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: Colors.textMuted }}>
            {entry.servings} serving{entry.servings !== 1 ? 's' : ''}
          </Text>
          {(entry as any).nutrition && (
            <Text style={{ fontSize: 11, color: Colors.textMuted }}>
              · {(entry as any).nutrition.calories} kcal
            </Text>
          )}
        </View>
      </View>

      {/* Actions */}
      {!isCooked && (
        <Pressable
          onPress={onMarkCooked}
          hitSlop={8}
          style={{
            backgroundColor: Colors.success + '15',
            borderRadius: BorderRadius.sm,
            padding: 6,
            marginLeft: 6,
          }}
        >
          <Text style={{ fontSize: 14 }}>✓</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onRemove}
        hitSlop={8}
        style={{
          padding: 6,
          marginLeft: 4,
        }}
      >
        <Text style={{ fontSize: 12, color: Colors.textMuted }}>✕</Text>
      </Pressable>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const insets = useSafeAreaInsets();
  const {
    activePlan,
    nutritionGoals,
    isLoading,
    fetchActivePlan,
    createPlan,
    addEntry,
    removeEntry,
    markCooked,
    generateGroceryListFromPlan,
  } = useMealPlanStore();

  const { recipes } = useRecipeStore();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  // Add-recipe sheet state
  const [addSheet, setAddSheet] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [selectedServings, setSelectedServings] = useState(2);
  const [recipeSearch, setRecipeSearch] = useState('');

  // Sheet slide animation
  const sheetAnim = useRef(new Animated.Value(600)).current;

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(() =>
      setAddSheet(null)
    );
  }, [sheetAnim]);

  // Nutrition cache per day
  const [dayNutrition, setDayNutrition] = useState<Record<string, DayNutrition>>({});

  // Grocery list generation
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchActivePlan();
  }, []);

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      }),
    [weekStart]
  );

  const today = new Date().toISOString().split('T')[0];

  // Load nutrition for visible week when plan changes
  useEffect(() => {
    if (!activePlan) return;
    const planId = activePlan.id;

    const loadNutrition = async () => {
      const results: Record<string, DayNutrition> = {};
      await Promise.all(
        weekDates.map(async (date) => {
          try {
            results[date] = await getDayNutrition(planId, date);
          } catch (_e) {
            // ignore
          }
        })
      );
      setDayNutrition((prev) => ({ ...prev, ...results }));
    };

    loadNutrition();
  }, [activePlan, weekStart, weekDates]);

  const handlePrevWeek = useCallback(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }, [weekStart]);

  const handleNextWeek = useCallback(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }, [weekStart]);

  const handleToday = useCallback(() => {
    setWeekStart(getWeekStart(new Date()));
  }, []);

  const handleOpenAddSheet = useCallback(
    async (date: string, slot: MealSlot) => {
      // Ensure a plan exists for this week
      if (!activePlan) {
        const start = weekDates[0];
        const end = weekDates[6];
        await createPlan(start, end);
      }
      setSelectedServings(2);
      setRecipeSearch('');
      setAddSheet({ date, slot });
      sheetAnim.setValue(600);
      Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
    },
    [activePlan, weekDates, createPlan, sheetAnim]
  );

  const handleAddRecipe = useCallback(
    async (recipe: Recipe) => {
      if (!addSheet) return;
      let planId = activePlan?.id;

      if (!planId) {
        try {
          const plan = await createPlan(weekDates[0], weekDates[6]);
          planId = plan.id;
        } catch (e) {
          Alert.alert('Error', (e as Error).message);
          return;
        }
      }

      try {
        await addEntry(planId, recipe.id, addSheet.date, addSheet.slot, selectedServings);
        closeSheet();

        // Refresh nutrition for that day
        const nut = await getDayNutrition(planId, addSheet.date);
        setDayNutrition((prev) => ({ ...prev, [addSheet.date]: nut }));
      } catch (e) {
        Alert.alert('Error', (e as Error).message);
      }
    },
    [addSheet, activePlan, weekDates, createPlan, addEntry, selectedServings]
  );

  const handleRemoveEntry = useCallback(
    async (entryId: number, date: string) => {
      Alert.alert('Remove meal', 'Remove this meal from your plan?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeEntry(entryId);
            if (activePlan) {
              const nut = await getDayNutrition(activePlan.id, date);
              setDayNutrition((prev) => ({ ...prev, [date]: nut }));
            }
          },
        },
      ]);
    },
    [removeEntry, activePlan]
  );

  const handleMarkCooked = useCallback(
    async (entryId: number, date: string) => {
      await markCooked(entryId);
      if (activePlan) {
        const nut = await getDayNutrition(activePlan.id, date);
        setDayNutrition((prev) => ({ ...prev, [date]: nut }));
      }
    },
    [markCooked, activePlan]
  );

  const handleGenerateGroceryList = useCallback(async () => {
    if (!activePlan) return;

    setIsGenerating(true);
    try {
      const { itemCount } = await generateGroceryListFromPlan(activePlan.id);
      Alert.alert(
        'Grocery list created',
        `${itemCount} item${itemCount !== 1 ? 's' : ''} added (pantry items already subtracted).`,
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'View list',
            onPress: () => router.push('/(tabs)/grocery'),
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }, [activePlan, generateGroceryListFromPlan]);

  const handleCreateWeekPlan = useCallback(async () => {
    try {
      await createPlan(weekDates[0], weekDates[6]);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    }
  }, [createPlan, weekDates]);

  // Filter recipes by search
  const filteredRecipes = useMemo(() => {
    if (!recipeSearch.trim()) return recipes;
    const q = recipeSearch.toLowerCase();
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.cuisine?.toLowerCase().includes(q) ?? false)
    );
  }, [recipes, recipeSearch]);

  // Get entries for a specific date and slot
  const getSlotEntries = (date: string, slot: MealSlot): MealPlanEntry[] => {
    return (activePlan?.entries ?? []).filter(
      (e) => e.date === date && e.mealSlot === slot
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

      {/* ── Header ── */}
      <View
        style={{
          backgroundColor: Colors.surface,
          paddingHorizontal: Spacing.md,
          paddingTop: insets.top + 8,
          paddingBottom: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: '800',
                color: Colors.textPrimary,
                letterSpacing: -0.5,
              }}
            >
              Meal Plan
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 1 }}>
              {activePlan ? activePlan.name : 'Plan your week'}
            </Text>
          </View>

          {activePlan && (
            <Pressable
              onPress={handleGenerateGroceryList}
              disabled={isGenerating}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: Colors.primary,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: BorderRadius.full,
              }}
            >
              {isGenerating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={{ fontSize: 13 }}>🛒</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                    List
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <MealPlanCalendar
          weekStart={weekStart}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onToday={handleToday}
        />
      </View>

      {/* ── Content ── */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ fontSize: 14, color: Colors.textSecondary, marginTop: 12 }}>
            Loading plan...
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.md,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {/* No plan CTA */}
          {!activePlan && (
            <View
              style={{
                backgroundColor: Colors.surface,
                borderRadius: BorderRadius.lg,
                padding: Spacing.lg,
                alignItems: 'center',
                marginBottom: Spacing.md,
                ...Shadow.card,
              }}
            >
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📅</Text>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '800',
                  color: Colors.textPrimary,
                  marginBottom: 6,
                  textAlign: 'center',
                }}
              >
                No plan for this week
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: Colors.textSecondary,
                  textAlign: 'center',
                  marginBottom: 20,
                  lineHeight: 20,
                }}
              >
                Create a meal plan to organize your week, track nutrition, and generate shopping
                lists automatically.
              </Text>
              <Pressable
                onPress={handleCreateWeekPlan}
                style={{
                  backgroundColor: Colors.primary,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: BorderRadius.full,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  Create this week's plan
                </Text>
              </Pressable>
            </View>
          )}

          {/* Day cards */}
          {weekDates.map((date) => {
            const { dayName, dayNum, monthStr } = formatDayHeader(date);
            const isToday = date === today;
            const nut = dayNutrition[date] ?? null;
            const hasEntries = MEAL_SLOTS.some(
              ({ slot }) => getSlotEntries(date, slot).length > 0
            );

            return (
              <View
                key={date}
                style={{
                  backgroundColor: Colors.surface,
                  borderRadius: BorderRadius.lg,
                  marginBottom: 12,
                  overflow: 'hidden',
                  borderWidth: isToday ? 2 : 1,
                  borderColor: isToday ? Colors.primary : Colors.border,
                  ...Shadow.card,
                }}
              >
                {/* Day header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: Spacing.md,
                    paddingVertical: 10,
                    backgroundColor: isToday ? Colors.primary + '08' : 'transparent',
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isToday ? Colors.primary : Colors.background,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '800',
                        color: isToday ? '#fff' : Colors.textPrimary,
                      }}
                    >
                      {dayNum}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: Colors.textPrimary,
                      }}
                    >
                      {dayName}
                      {isToday ? ' · Today' : ''}
                    </Text>
                    <Text style={{ fontSize: 12, color: Colors.textMuted }}>{monthStr}</Text>
                  </View>

                  {hasEntries && nut && (
                    <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color:
                            nut.percentages.calories > 100
                              ? Colors.error
                              : Colors.textSecondary,
                        }}
                      >
                        {nut.totals.calories} kcal
                      </Text>
                      <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                        {nut.percentages.calories}% of goal
                      </Text>
                    </View>
                  )}
                </View>

                {/* Meal slots */}
                <View style={{ paddingHorizontal: Spacing.md, paddingTop: 10, paddingBottom: 4 }}>
                  {MEAL_SLOTS.map(({ slot, label, emoji }) => {
                    const entries = getSlotEntries(date, slot);

                    return (
                      <View key={slot} style={{ marginBottom: 10 }}>
                        {/* Slot header */}
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}
                        >
                          <Text style={{ fontSize: 12 }}>{emoji}</Text>
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: Colors.textMuted,
                              marginLeft: 4,
                              textTransform: 'uppercase',
                              letterSpacing: 0.5,
                            }}
                          >
                            {label}
                          </Text>
                        </View>

                        {/* Entries */}
                        {entries.map((entry) => (
                          <EntryCard
                            key={entry.id}
                            entry={entry}
                            onRemove={() => handleRemoveEntry(entry.id, date)}
                            onMarkCooked={() => handleMarkCooked(entry.id, date)}
                          />
                        ))}

                        {/* Add button */}
                        {activePlan && (
                          <Pressable
                            onPress={() => handleOpenAddSheet(date, slot)}
                            style={{
                              marginTop: entries.length > 0 ? 6 : 2,
                              paddingVertical: 7,
                              paddingHorizontal: 12,
                              borderRadius: BorderRadius.sm,
                              borderWidth: 1,
                              borderColor: Colors.border,
                              borderStyle: 'dashed',
                              alignItems: 'center',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              gap: 4,
                            }}
                          >
                            <Text style={{ fontSize: 13, color: Colors.textMuted }}>+</Text>
                            <Text
                              style={{
                                fontSize: 12,
                                color: Colors.textMuted,
                                fontWeight: '500',
                              }}
                            >
                              Add recipe
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Nutrition bar */}
                {hasEntries && (
                  <>
                    <View
                      style={{
                        height: 1,
                        backgroundColor: Colors.border,
                        marginHorizontal: Spacing.md,
                      }}
                    />
                    <DayNutritionBar nutrition={nut} compact />
                  </>
                )}
              </View>
            );
          })}

          {/* Bottom generate-list CTA if no plan yet shown */}
          {!activePlan && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 13,
                color: Colors.textMuted,
                marginTop: 8,
              }}
            >
              Tap "+" on any meal slot to add a recipe after creating a plan.
            </Text>
          )}
        </ScrollView>
      )}

      {/* ── Add Recipe Bottom Sheet (inline overlay — stays above tab bar) ── */}
      {addSheet !== null && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
          {/* Backdrop */}
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeSheet}
          />

          {/* Sheet */}
          <Animated.View
            style={{
              backgroundColor: Colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingBottom: insets.bottom + 16,
              maxHeight: '88%',
              transform: [{ translateY: sheetAnim }],
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 40,
                height: 4,
                backgroundColor: Colors.border,
                borderRadius: 2,
                alignSelf: 'center',
                marginTop: 12,
                marginBottom: 20,
              }}
            />

            {/* Header — emoji + slot name + date */}
            <View style={{ alignItems: 'center', paddingHorizontal: Spacing.md, marginBottom: 20 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: Colors.primary + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 26 }}>
                  {addSheet ? MEAL_SLOTS.find((s) => s.slot === addSheet.slot)?.emoji : '🍽️'}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 19,
                  fontWeight: '800',
                  color: Colors.textPrimary,
                  letterSpacing: -0.3,
                }}
              >
                {addSheet ? MEAL_SLOTS.find((s) => s.slot === addSheet.slot)?.label : ''}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 3 }}>
                {addSheet ? formatSheetDate(addSheet.date) : ''}
              </Text>
            </View>

            {/* Servings stepper */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginHorizontal: Spacing.md,
                marginBottom: 16,
                backgroundColor: Colors.background,
                borderRadius: BorderRadius.md,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary }}>
                Servings
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                <Pressable
                  onPress={() => setSelectedServings((s) => Math.max(1, s - 1))}
                  hitSlop={8}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: Colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ fontSize: 18, color: Colors.textPrimary, lineHeight: 22 }}>−</Text>
                </Pressable>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '700',
                    color: Colors.textPrimary,
                    minWidth: 36,
                    textAlign: 'center',
                  }}
                >
                  {selectedServings}
                </Text>
                <Pressable
                  onPress={() => setSelectedServings((s) => Math.min(12, s + 1))}
                  hitSlop={8}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: Colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18, color: '#fff', lineHeight: 22 }}>+</Text>
                </Pressable>
              </View>
            </View>

            {/* Search bar */}
            <View style={{ paddingHorizontal: Spacing.md, marginBottom: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: Colors.background,
                  borderRadius: BorderRadius.md,
                  paddingHorizontal: 12,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ fontSize: 14, color: Colors.textMuted, marginRight: 6 }}>🔍</Text>
                <TextInput
                  value={recipeSearch}
                  onChangeText={setRecipeSearch}
                  placeholder="Search recipes..."
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: Colors.textPrimary,
                  }}
                />
              </View>
            </View>

            {/* Recipe list */}
            {recipes.length === 0 ? (
              <View
                style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: Spacing.lg }}
              >
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📚</Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: Colors.textMuted,
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  No recipes in your library yet.{'\n'}Extract a recipe first!
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredRecipes}
                keyExtractor={(r) => r.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: 4 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => handleAddRecipe(item)}
                    android_ripple={{ color: Colors.background }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: Spacing.md,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: Colors.border,
                        gap: 12,
                      }}
                    >
                      {/* Accent dot */}
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          backgroundColor: Colors.primary + '12',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Text style={{ fontSize: 20 }}>
                          {item.cuisine === 'Italian' ? '🍝'
                            : item.cuisine === 'Indian' ? '🍛'
                            : item.cuisine === 'Mexican' ? '🌮'
                            : item.cuisine === 'Japanese' ? '🍱'
                            : item.cuisine === 'Chinese' ? '🥢'
                            : item.cuisine === 'Thai' ? '🍜'
                            : item.cuisine === 'American' ? '🍔'
                            : '🍽️'}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary }}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                          {[
                            item.cuisine,
                            item.cookTime,
                            item.nutrition
                              ? `${item.nutrition.caloriesPerServing * selectedServings} kcal`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>

                      <View
                        style={{
                          backgroundColor: Colors.primary,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Add</Text>
                      </View>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}
