import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  Pressable,
  Image,
  StatusBar,
  Animated,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useRecipeStore } from '@/store/recipeStore';
import { Colors, Spacing, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import { API_URL } from '@/constants/config';
import type { Recipe } from '@/store/types';
import DiscoverCard from '@/components/DiscoverCard';
import { getUserPreferences, importRecipe, type UserPreferences } from '@/services/recommend';
import {
  getDiscoverMeals, getMealDetail, mealToImportPayload,
  type MealSummary, type MealDetail,
} from '@/services/mealdb';

// ── Cuisine theme map ─────────────────────────────────────────────────────────
const CUISINE_MAP: Record<string, { bg: string; emoji: string }> = {
  indian:         { bg: '#E8612A', emoji: '🍛' },
  italian:        { bg: '#22A55E', emoji: '🍝' },
  mexican:        { bg: '#D97706', emoji: '🌮' },
  chinese:        { bg: '#DC2626', emoji: '🥡' },
  japanese:       { bg: '#DB2777', emoji: '🍱' },
  american:       { bg: '#2563EB', emoji: '🍔' },
  french:         { bg: '#7C3AED', emoji: '🥐' },
  thai:           { bg: '#059669', emoji: '🍜' },
  mediterranean:  { bg: '#0891B2', emoji: '🫒' },
  korean:         { bg: '#EA580C', emoji: '🍲' },
  greek:          { bg: '#0284C7', emoji: '🥗' },
  spanish:        { bg: '#B91C1C', emoji: '🥘' },
  vietnamese:     { bg: '#15803D', emoji: '🍵' },
};
const FALLBACK_PALETTE = ['#C2410C', '#1D4ED8', '#6D28D9', '#065F46', '#BE185D', '#92400E'];
// Deep dark tones used as the second gradient stop — each looks rich paired with any cuisine color
const GRADIENT_DARKS = ['#1A1A2E', '#16213E', '#0F3460', '#240046', '#1B262C', '#162447', '#10002B', '#0D1B2A'];
function hashIndex(s: string, len: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % len;
}
function getCuisineTheme(cuisine: string | null, title: string): { bg: string; bg2: string; emoji: string } {
  const dark = GRADIENT_DARKS[hashIndex(title, GRADIENT_DARKS.length)];
  if (cuisine) {
    const lower = cuisine.toLowerCase();
    for (const [key, theme] of Object.entries(CUISINE_MAP)) {
      if (lower.includes(key)) return { bg: theme.bg, bg2: dark, emoji: theme.emoji };
    }
  }
  const bg = FALLBACK_PALETTE[hashIndex(title + '_bg', FALLBACK_PALETTE.length)];
  return { bg, bg2: dark, emoji: '🍽️' };
}

// ── Cook Tonight algorithm ────────────────────────────────────────────────────
function pickCookTonight(recipes: Recipe[], prefs: UserPreferences | null, seed: number): Recipe | null {
  if (!recipes.length) return null;
  const dayKey = Math.floor(Date.now() / 86400000) + seed;
  const scored = recipes.map((r) => {
    let score = Math.abs((dayKey * 2654435761) ^ r.id.charCodeAt(0)) % 1000;
    if (prefs?.favoriteCuisines.includes(r.cuisine ?? '')) score += 200;
    if (prefs?.recentlyCookedIds.includes(r.id)) score -= 300;
    if (!r.lastCookRating) score += 100;
    if ((r.lastCookRating ?? 0) >= 4) score += 150;
    return { r, score };
  });
  return scored.sort((a, b) => b.score - a.score)[0].r;
}

// ── Derive YouTube thumbnail from a video URL ─────────────────────────────────
function getYouTubeThumbnail(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

function getRecipePhoto(recipe: Recipe): string | null {
  if (recipe.thumbnailUrl) {
    // Relative path → prepend server base URL (works for any device IP)
    return recipe.thumbnailUrl.startsWith('/') ? `${API_URL}${recipe.thumbnailUrl}` : recipe.thumbnailUrl;
  }
  if (recipe.sourceUrl) return getYouTubeThumbnail(recipe.sourceUrl);
  return null;
}

// ── Small horizontal recipe card ──────────────────────────────────────────────
function SmallRecipeCard({ recipe }: { recipe: Recipe }) {
  const { bg, bg2, emoji } = getCuisineTheme(recipe.cuisine, recipe.title);
  const photoUri = getRecipePhoto(recipe);

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      style={({ pressed }) => [
        styles.smallCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.smallCardBanner}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.smallCardPhoto} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[bg, bg2]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <View style={styles.smallCardEmojiRing}>
              <Text style={styles.smallCardEmoji}>{emoji}</Text>
            </View>
          </LinearGradient>
        )}
        {recipe.lastCookRating ? (
          <View style={styles.smallCardRatingBadge}>
            <Text style={styles.smallCardRatingText}>{'★ ' + recipe.lastCookRating}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.smallCardBody}>
        <Text style={styles.smallCardTitle} numberOfLines={2}>{recipe.title}</Text>
        {recipe.cuisine ? (
          <Text style={[styles.smallCardCuisine, { color: photoUri ? Colors.textMuted : bg }]} numberOfLines={1}>
            {recipe.cuisine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({
  label, action, onAction,
}: { label: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, isSyncing, syncRecipes } = useRecipeStore();

  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [discoverMeals, setDiscoverMeals] = useState<MealSummary[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [cookTonightSeed, setCookTonightSeed] = useState(0);
  const [previewMeal, setPreviewMeal] = useState<MealDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(700)).current;

  const openSheet = useCallback((meal: MealDetail) => {
    setPreviewMeal(meal);
    Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 280 }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, { toValue: 700, duration: 220, useNativeDriver: true })
      .start(() => setPreviewMeal(null));
  }, [sheetAnim]);

  useEffect(() => {
    getUserPreferences().then(setPreferences).catch(() => null);
  }, []);

  useEffect(() => {
    setDiscoverLoading(true);
    getDiscoverMeals(preferences?.favoriteCuisines ?? [])
      .then(setDiscoverMeals)
      .finally(() => setDiscoverLoading(false));
  }, [preferences]);

  const handleDiscoverPress = useCallback(async (meal: MealSummary) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoadingCardId(meal.idMeal);
    const detail = await getMealDetail(meal.idMeal);
    setLoadingCardId(null);
    if (detail) openSheet(detail);
    else Alert.alert('Could not load recipe', 'Please try again.');
  }, [openSheet]);

  const handleSaveMeal = useCallback(async () => {
    if (!previewMeal) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSavingMeal(true);
    try {
      const payload = mealToImportPayload(previewMeal);
      const saved = await importRecipe(payload);
      await syncRecipes();
      closeSheet();
      setTimeout(() => router.push(`/recipe/${saved.id}`), 300);
    } catch (e) {
      Alert.alert('Could not save recipe', (e as Error).message);
    } finally {
      setIsSavingMeal(false);
    }
  }, [previewMeal, syncRecipes, closeSheet]);

  const onRefresh = useCallback(async () => { await syncRecipes(); }, [syncRecipes]);

  const recentRecipes = [...recipes]
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
    .slice(0, 6);

  const cookTonight = pickCookTonight(recipes, preferences, cookTonightSeed);
  const cookTonightTheme = cookTonight ? getCuisineTheme(cookTonight.cuisine, cookTonight.title) : null;
  const cookTonightPhoto = cookTonight ? getRecipePhoto(cookTonight) : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetingEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';

  const DIFF_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.greetingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greetingLine}>
                {greeting}
                {'  '}
                <Text style={styles.greetingEmoji}>{greetingEmoji}</Text>
              </Text>
              <Text style={styles.greetingSubtitle}>
                {recipes.length > 0
                  ? `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'} in your collection`
                  : 'Your personal cookbook'}
              </Text>
            </View>
          </View>
          {preferences && preferences.cookCount >= 3 && preferences.favoriteCuisines.length > 0 ? (
            <View style={styles.lovePill}>
              <Text style={styles.lovePillText}>
                {'You love ' + preferences.favoriteCuisines[0] + ' food ❤️'}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <Pressable
          style={styles.searchBar}
          onPress={() => router.push({ pathname: '/(tabs)/library', params: { focus: '1' } })}
        >
          <Text style={styles.searchIcon}>{'🔍'}</Text>
          <Text style={styles.searchPlaceholder}>Search your recipes…</Text>
        </Pressable>

        {/* ── Cook Tonight ────────────────────────────────────────────────── */}
        {recipes.length === 0 ? (
          /* Empty state */
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>{'👨‍🍳'}</Text>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptyDesc}>
              Paste a TikTok, Instagram, or YouTube link to extract your first recipe.
            </Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/(tabs)/add')}>
              <Text style={styles.emptyCtaText}>Add a Recipe</Text>
            </Pressable>
          </View>
        ) : cookTonight && cookTonightTheme ? (
          <View style={styles.section}>
            <SectionHeader
              label="COOK TONIGHT"
              action="🎲  Shuffle"
              onAction={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCookTonightSeed((s) => s + 1);
              }}
            />

            <Pressable
              onPress={() => router.push(`/recipe/${cookTonight.id}`)}
              style={({ pressed }) => [
                styles.featuredCard,
                pressed && { opacity: 0.93, transform: [{ scale: 0.99 }] },
              ]}
            >
              {/* Cuisine banner — photo if available, else unique gradient */}
              {cookTonightPhoto ? (
                <View style={styles.featuredBanner}>
                  <Image source={{ uri: cookTonightPhoto }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  <View style={styles.featuredBannerScrim} />
                  <View style={styles.todaysBadge}>
                    <Text style={styles.todaysBadgeText}>TODAY'S PICK</Text>
                  </View>
                  {cookTonight.difficulty ? (
                    <View style={styles.diffBadge}>
                      <Text style={styles.diffBadgeText}>
                        {DIFF_LABEL[cookTonight.difficulty] ?? cookTonight.difficulty}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <LinearGradient
                  colors={[cookTonightTheme.bg, cookTonightTheme.bg2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.featuredBanner}
                >
                  <View style={styles.todaysBadge}>
                    <Text style={styles.todaysBadgeText}>TODAY'S PICK</Text>
                  </View>
                  {cookTonight.difficulty ? (
                    <View style={styles.diffBadge}>
                      <Text style={styles.diffBadgeText}>
                        {DIFF_LABEL[cookTonight.difficulty] ?? cookTonight.difficulty}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.featuredEmojiRing}>
                    <Text style={styles.featuredEmoji}>{cookTonightTheme.emoji}</Text>
                  </View>
                </LinearGradient>
              )}

              {/* Card body */}
              <View style={styles.featuredBody}>
                <Text style={styles.featuredTitle} numberOfLines={2}>{cookTonight.title}</Text>

                {/* Meta row */}
                <View style={styles.featuredMeta}>
                  {cookTonight.cuisine ? (
                    <View style={[styles.metaCuisineChip, { backgroundColor: cookTonightTheme.bg + '18' }]}>
                      <Text style={[styles.metaCuisineText, { color: cookTonightTheme.bg }]}>
                        {cookTonight.cuisine}
                      </Text>
                    </View>
                  ) : null}
                  {cookTonight.cookTime ? (
                    <Text style={styles.metaDot}>{'·'}</Text>
                  ) : null}
                  {cookTonight.cookTime ? (
                    <Text style={styles.metaInfo}>{'⏱  ' + cookTonight.cookTime}</Text>
                  ) : null}
                  {cookTonight.lastCookRating ? (
                    <>
                      <Text style={styles.metaDot}>{'·'}</Text>
                      <Text style={styles.metaStar}>{'★  ' + cookTonight.lastCookRating}</Text>
                    </>
                  ) : null}
                </View>

                {/* Start Cooking CTA */}
                <Pressable
                  style={[styles.cookBtn, { backgroundColor: cookTonightTheme.bg }]}
                  onPress={() => router.push(`/cook/${cookTonight.id}`)}
                >
                  <Text style={styles.cookBtnText}>{'🔥  Start Cooking'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* ── Recently Saved ───────────────────────────────────────────────── */}
        {recentRecipes.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              label="RECENTLY SAVED"
              action="See all"
              onAction={() => router.push('/(tabs)/library')}
            />
            <FlatList
              data={recentRecipes}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(r) => r.id}
              renderItem={({ item }) => <SmallRecipeCard recipe={item} />}
              contentContainerStyle={styles.hListContent}
            />
          </View>
        ) : null}

        {/* ── Discover ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            label="DISCOVER"
            action="Refresh"
            onAction={() => {
              setDiscoverLoading(true);
              getDiscoverMeals(preferences?.favoriteCuisines ?? [])
                .then(setDiscoverMeals)
                .finally(() => setDiscoverLoading(false));
            }}
          />
          <Text style={styles.discoverSubtitle}>Recipes from kitchens around the world</Text>

          {discoverLoading ? (
            <FlatList
              data={[1, 2, 3, 4]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(i) => String(i)}
              renderItem={() => <View style={styles.discoverSkeleton} />}
              contentContainerStyle={styles.hListContent}
            />
          ) : discoverMeals.length > 0 ? (
            <FlatList
              data={discoverMeals}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(m) => m.idMeal}
              renderItem={({ item }) => (
                <DiscoverCard
                  meal={item}
                  onPress={handleDiscoverPress}
                  isLoading={loadingCardId === item.idMeal}
                />
              )}
              contentContainerStyle={styles.hListContent}
            />
          ) : (
            <View style={styles.discoverErrorBox}>
              <Text style={styles.discoverErrorIcon}>{'🌐'}</Text>
              <Text style={styles.discoverErrorText}>
                {'Couldn\'t connect to Discover.\nTap Refresh to try again.'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Preview sheet overlay ────────────────────────────────────────── */}
      {previewMeal ? (
        <View style={StyleSheet.absoluteFillObject}>
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <Animated.View
            style={[
              styles.previewSheet,
              { transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 },
            ]}
          >
            <View style={styles.handle} />
            <Image source={{ uri: previewMeal.strMealThumb }} style={styles.previewThumb} resizeMode="cover" />
            <View style={styles.previewBody}>
              <Text style={styles.previewTitle}>{previewMeal.strMeal}</Text>
              <View style={styles.previewChips}>
                {[previewMeal.strArea, previewMeal.strCategory].filter(Boolean).map((tag) => (
                  <View key={tag} style={styles.chip}>
                    <Text style={styles.chipText}>{tag}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.previewIngLabel}>Ingredients</Text>
              <Text style={styles.previewIngList}>
                {(() => {
                  const ings: string[] = [];
                  for (let i = 1; i <= 20; i++) {
                    const item = previewMeal[`strIngredient${i}`]?.trim();
                    if (item) ings.push(item);
                  }
                  const visible = ings.slice(0, 7);
                  const extra = ings.length - visible.length;
                  return visible.join(', ') + (extra > 0 ? ` and ${extra} more` : '');
                })()}
              </Text>
              <Pressable
                style={[styles.saveBtn, isSavingMeal && { opacity: 0.5 }]}
                onPress={handleSaveMeal}
                disabled={isSavingMeal}
              >
                {isSavingMeal
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Add to My Recipes</Text>
                }
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  greetingLine: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary, lineHeight: 32 },
  greetingEmoji: { fontSize: 22 },
  greetingSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  lovePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0EA',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FDDBC9',
    marginTop: 6,
  },
  lovePillText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { fontSize: 16 },
  searchPlaceholder: { fontSize: FontSize.sm, color: Colors.textMuted },

  // Section layout
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.1,
  },
  sectionAction: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },

  // Featured card (Cook Tonight)
  featuredCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...Shadow.card,
  },
  featuredBanner: {
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  featuredBannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  todaysBadge: {
    position: 'absolute',
    top: 12,
    left: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  todaysBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  diffBadge: {
    position: 'absolute',
    top: 12,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  diffBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  featuredEmojiRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredEmoji: { fontSize: 46 },
  featuredBody: { padding: 16 },
  featuredTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: 8,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  metaCuisineChip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  metaCuisineText: { fontSize: 12, fontWeight: '700' },
  metaDot: { fontSize: 14, color: Colors.textMuted },
  metaInfo: { fontSize: 13, color: Colors.textSecondary },
  metaStar: { fontSize: 13, color: Colors.warning, fontWeight: '600' },
  cookBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cookBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700', letterSpacing: 0.2 },

  // Horizontal list
  hListContent: { paddingHorizontal: Spacing.md },

  // Small recipe card
  smallCard: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 10,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  smallCardBanner: { height: 96, overflow: 'hidden' },
  smallCardPhoto: { width: '100%', height: 96 },
  smallCardEmojiRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallCardEmoji: { fontSize: 28 },
  smallCardRatingBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  smallCardRatingText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  smallCardBody: { padding: 10 },
  smallCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 16,
    marginBottom: 3,
  },
  smallCardCuisine: { fontSize: 11, fontWeight: '700' },

  // Discover
  discoverSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    marginBottom: 10,
  },
  discoverSkeleton: {
    width: 150,
    height: 170,
    borderRadius: 14,
    backgroundColor: Colors.border,
    marginRight: 10,
  },
  discoverErrorBox: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  discoverErrorIcon: { fontSize: 28 },
  discoverErrorText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Empty state
  emptyCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyCta: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  // Preview sheet
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  previewSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    ...Shadow.md,
  },
  handle: {
    width: 38, height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  previewThumb: { width: '100%', height: 190 },
  previewBody: { padding: Spacing.md },
  previewTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  previewChips: { flexDirection: 'row', gap: 6, marginBottom: Spacing.sm },
  chip: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  previewIngLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  previewIngList: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
});
