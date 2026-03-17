import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking, Modal, Switch, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, router } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { useGroceryStore } from '@/store/groceryStore';
import { IngredientList } from '@/components/IngredientList';
import { StepList } from '@/components/StepList';
import { ServingScaler } from '@/components/ServingScaler';
import { AdaptationPills } from '@/components/AdaptationPills';
import { AdaptationSheet } from '@/components/AdaptationSheet';
import { NutritionCard } from '@/components/NutritionCard';
import { SubstitutionSheet } from '@/components/SubstitutionSheet';
import { Colors, Spacing } from '@/constants/theme';
import { formatShoppingList, formatRecipeAsText } from '@/utils/formatters';
import { scaleRecipe, updateServings, adaptRecipeApi } from '@/services/api';
import type { AdaptationResult, AdaptationType, GroceryList, Ingredient, SubstitutionSuggestion } from '@/store/types';

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: '✓ High confidence',
  medium: '~ Medium confidence',
  low: '⚠ Low confidence',
};

// ── Add to Grocery Sheet ──────────────────────────────────────────────────────

interface GrocerySheetProps {
  visible: boolean;
  recipeId: string;
  recipeTitle: string;
  onClose: () => void;
}

function AddToGrocerySheet({ visible, recipeId, recipeTitle, onClose }: GrocerySheetProps) {
  const { lists, fetchLists, createList } = useGroceryStore();
  const [subtractPantry, setSubtractPantry] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && lists.length === 0) {
      void fetchLists();
    }
  }, [visible]);

  const activeLists = lists.filter((l) => l.isActive);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createList({ recipeIds: [recipeId], subtractPantry });
      onClose();
      router.push('/(tabs)/grocery');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToExisting = async (list: GroceryList) => {
    setLoading(true);
    try {
      // For now, create a new list — merging into existing is a future enhancement
      await createList({ recipeIds: [recipeId, ...list.recipeIds], subtractPantry });
      onClose();
      router.push('/(tabs)/grocery');
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: Colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 24,
            paddingBottom: 40,
            gap: 16,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textPrimary }}>
            Add to Grocery List
          </Text>
          <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
            {recipeTitle}
          </Text>

          {/* Pantry subtraction toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 14, color: Colors.textPrimary }}>Exclude pantry items</Text>
            <Switch
              value={subtractPantry}
              onValueChange={setSubtractPantry}
              trackColor={{ true: Colors.primary, false: Colors.border }}
              thumbColor="#fff"
            />
          </View>

          {/* Create new list */}
          <Pressable
            onPress={() => { void handleCreate(); }}
            disabled={loading}
            style={{
              backgroundColor: Colors.primary,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {loading ? 'Building list...' : '+ Create new list'}
            </Text>
          </Pressable>

          {/* Existing active lists */}
          {activeLists.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
                <Text style={{ fontSize: 12, color: Colors.textMuted }}>or add to existing</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: Colors.border }} />
              </View>
              {activeLists.map((list) => (
                <Pressable
                  key={list.id}
                  onPress={() => { void handleAddToExisting(list); }}
                  disabled={loading}
                  style={{
                    backgroundColor: Colors.background,
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 14, color: Colors.textPrimary, fontWeight: '500' }}>
                    {list.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                    {list.recipeIds.length} recipe{list.recipeIds.length !== 1 ? 's' : ''}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          {/* Cancel */}
          <Pressable
            onPress={onClose}
            style={{ paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 15, color: Colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, saveRecipe, deleteRecipe } = useRecipeStore();
  const insets = useSafeAreaInsets();
  const [showGrocerySheet, setShowGrocerySheet] = useState(false);

  const recipe = recipes.find((r) => r.id === id);

  // ── Serving scaler local state ─────────────────────────────────────────────
  // Parse originalServings from text field ("Serves 3-4" → 4) when numeric is absent
  const originalServings = recipe?.originalServings ?? (() => {
    const nums = (recipe?.servings ?? '').match(/\d+/g);
    return nums ? parseInt(nums[nums.length - 1], 10) : 4;
  })();
  const [currentServings, setCurrentServings] = useState(originalServings);
  const [displayIngredients, setDisplayIngredients] = useState<Ingredient[]>(
    recipe?.ingredients ?? [],
  );
  const [isScaling, setIsScaling] = useState(false);
  const [isSavingServings, setIsSavingServings] = useState(false);
  const listOpacity = useRef(new Animated.Value(1)).current;

  // ── Substitution state ─────────────────────────────────────────────────────
  const [subIngredient, setSubIngredient] = useState<Ingredient | null>(null);
  const [showSubSheet, setShowSubSheet] = useState(false);

  // ── Adaptation state ───────────────────────────────────────────────────────
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptationResult, setAdaptationResult] = useState<AdaptationResult | null>(null);
  const [showAdaptationSheet, setShowAdaptationSheet] = useState(false);

  // Reset scaling state when recipe changes (e.g. navigating between recipes)
  useEffect(() => {
    if (recipe) {
      setCurrentServings(recipe.originalServings ?? 4);
      setDisplayIngredients(recipe.ingredients);
    }
  }, [recipe?.id]);

  const handleServingChange = useCallback(
    async (newServings: number) => {
      if (!recipe) return;
      setCurrentServings(newServings);

      // Restore original if back to baseline
      if (newServings === (recipe.originalServings ?? 4)) {
        setDisplayIngredients(recipe.ingredients);
        return;
      }

      setIsScaling(true);
      Animated.timing(listOpacity, {
        toValue: 0.35,
        duration: 120,
        useNativeDriver: true,
      }).start();

      try {
        const scaled = await scaleRecipe(recipe.id, newServings);
        setDisplayIngredients(scaled);
      } catch {
        // keep current display on error
      } finally {
        setIsScaling(false);
        Animated.timing(listOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    [recipe, listOpacity],
  );

  const handleSaveDefault = useCallback(async () => {
    if (!recipe) return;
    setIsSavingServings(true);
    try {
      const updated = await updateServings(recipe.id, currentServings);
      saveRecipe(updated);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setIsSavingServings(false);
    }
  }, [recipe, currentServings, saveRecipe]);

  const handleAdapt = useCallback(
    async (type: AdaptationType, customPrompt?: string) => {
      if (!recipe || isAdapting) return;
      setIsAdapting(true);

      // Fade ingredients list during adaptation
      Animated.timing(listOpacity, { toValue: 0.35, duration: 150, useNativeDriver: true }).start();

      try {
        const result = await adaptRecipeApi(recipe.id, type, customPrompt);

        if (result.alreadyCompliant) {
          const LABELS: Record<string, string> = {
            vegan: 'vegan', vegetarian: 'vegetarian', 'gluten-free': 'gluten-free',
            'dairy-free': 'dairy-free', keto: 'keto', halal: 'halal', 'nut-free': 'nut-free',
          };
          Alert.alert('Already compliant ✅', `This recipe is already ${LABELS[type] ?? type}!`);
        } else {
          // Save adapted recipe to local store so library updates immediately
          if (result.adaptedRecipe) {
            saveRecipe(result.adaptedRecipe);
          }
          setAdaptationResult(result);
          setShowAdaptationSheet(true);
        }
      } catch (e) {
        Alert.alert('Adaptation failed', (e as Error).message);
      } finally {
        setIsAdapting(false);
        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    },
    [recipe, isAdapting, listOpacity, saveRecipe],
  );

  const handleSubstitute = useCallback((ing: Ingredient) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubIngredient(ing);
    setShowSubSheet(true);
  }, []);

  const handleApplySubstitution = useCallback(
    (original: Ingredient, suggestion: SubstitutionSuggestion) => {
      setDisplayIngredients((prev) =>
        prev.map((ing) =>
          ing.id === original.id
            ? { ...ing, item: suggestion.replacement, quantity: suggestion.quantity, substituted: true }
            : ing,
        ),
      );
      setShowSubSheet(false);
    },
    [],
  );

  const handleAdaptSave = useCallback(() => {
    setShowAdaptationSheet(false);
    // Navigate to the adapted recipe
    if (adaptationResult?.adaptedRecipe) {
      router.push(`/recipe/${adaptationResult.adaptedRecipe.id}`);
    }
    setAdaptationResult(null);
  }, [adaptationResult]);

  const handleAdaptDiscard = useCallback(() => {
    setShowAdaptationSheet(false);
    // Remove the adapted recipe from store + server
    if (adaptationResult?.adaptedRecipe) {
      void deleteRecipe(adaptationResult.adaptedRecipe.id);
    }
    setAdaptationResult(null);
  }, [adaptationResult, deleteRecipe]);

  useEffect(() => {
    if (!recipe) router.replace('/(tabs)');
  }, [recipe]);

  if (!recipe) return null;

  const handleCopyShoppingList = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(formatShoppingList(recipe));
    Alert.alert('Copied!', 'Shopping list copied to clipboard.');
  };

  const handleShare = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(formatRecipeAsText(recipe));
    Alert.alert('Copied!', 'Recipe copied to clipboard.');
  };

  const handleDelete = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert('Delete Recipe', `Remove "${recipe.title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteRecipe(recipe.id);
        },
      },
    ]);
  };

  const handleAddToGrocery = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowGrocerySheet(true);
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient header */}
        <LinearGradient
          colors={['#FFF0E8', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ paddingTop: insets.top + 56, paddingBottom: 24, paddingHorizontal: Spacing.md }}
        >
          {/* Tags row */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {recipe.cuisine && (
              <View style={{ backgroundColor: `${Colors.primary}14`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.primary }}>{recipe.cuisine}</Text>
              </View>
            )}
            <View
              style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${DIFFICULTY_COLOR[recipe.difficulty]}18` }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: DIFFICULTY_COLOR[recipe.difficulty], textTransform: 'capitalize' }}>
                {recipe.difficulty}
              </Text>
            </View>
            <View style={{ backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: Colors.textSecondary }}>{CONFIDENCE_LABEL[recipe.confidence]}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={{ fontSize: 26, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8, lineHeight: 32 }}>
            {recipe.title}
          </Text>

          {/* Description */}
          {recipe.description && (
            <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 }}>
              {recipe.description}
            </Text>
          )}

          {/* Meta row — time info only (servings handled by ServingScaler below) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {recipe.prepTime && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 15 }}>⏱️</Text>
                <Text style={{ fontSize: 13, color: Colors.textSecondary }}>Prep {recipe.prepTime}</Text>
              </View>
            )}
            {recipe.cookTime && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 15 }}>🔥</Text>
                <Text style={{ fontSize: 13, color: Colors.textSecondary }}>Cook {recipe.cookTime}</Text>
              </View>
            )}
          </View>

          {/* Tags */}
          {recipe.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {recipe.tags.map((tag) => (
                <View key={tag} style={{ backgroundColor: Colors.background, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: Colors.textMuted }}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>

        {/* Serving scaler */}
        <ServingScaler
          originalServings={originalServings}
          currentServings={currentServings}
          onServingChange={(n) => { void handleServingChange(n); }}
          onSaveDefault={handleSaveDefault}
          isSaving={isSavingServings}
          isScaling={isScaling}
        />

        {/* Ingredients */}
        <View style={{ paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: Spacing.md }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              Ingredients
            </Text>
            <Pressable onPress={handleCopyShoppingList}>
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>📋 Copy list</Text>
            </Pressable>
          </View>

          {/* Dietary adaptation pills */}
          <AdaptationPills
            onAdapt={(type, customPrompt) => { void handleAdapt(type, customPrompt); }}
            isAdapting={isAdapting}
          />

          <Animated.View style={{ opacity: listOpacity, paddingHorizontal: Spacing.md }}>
            <IngredientList ingredients={displayIngredients} onSubstitute={handleSubstitute} />
          </Animated.View>
        </View>

        {/* Nutrition */}
        <NutritionCard
          recipe={recipe}
          currentServings={currentServings}
          onRecipeUpdate={saveRecipe}
        />

        {/* Steps */}
        <View style={{ paddingHorizontal: Spacing.md, paddingTop: 28 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16 }}>
            Instructions
          </Text>
          <StepList steps={recipe.steps} />
        </View>

        {/* Notes */}
        {recipe.notes && (
          <View style={{ marginHorizontal: Spacing.md, marginTop: 24, backgroundColor: `${Colors.primary}08`, borderRadius: 16, padding: 16, borderLeftWidth: 3, borderLeftColor: Colors.primary }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
              Notes
            </Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, lineHeight: 20 }}>{recipe.notes}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={{ paddingHorizontal: Spacing.md, marginTop: 32, gap: 10 }}>
          {/* Grocery list button */}
          <Pressable
            onPress={handleAddToGrocery}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4', borderRadius: 14, paddingVertical: 15 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#16A34A' }}>🛒 Add to Grocery List</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(recipe.sourceUrl)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textPrimary }}>▶ View original video</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textPrimary }}>📤 Copy recipe as text</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderRadius: 14, paddingVertical: 15 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.error }}>Delete recipe</Text>
          </Pressable>
        </View>
      </ScrollView>

      <AddToGrocerySheet
        visible={showGrocerySheet}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        onClose={() => setShowGrocerySheet(false)}
      />

      <AdaptationSheet
        visible={showAdaptationSheet}
        result={adaptationResult}
        adaptationType={(adaptationResult?.adaptationType ?? null) as AdaptationType | null}
        onSave={handleAdaptSave}
        onDiscard={handleAdaptDiscard}
      />

      <SubstitutionSheet
        visible={showSubSheet}
        ingredient={subIngredient}
        recipeId={recipe.id}
        onClose={() => setShowSubSheet(false)}
        onApply={handleApplySubstitution}
      />
    </>
  );
}
