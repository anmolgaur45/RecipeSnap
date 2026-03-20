import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { Colors, Spacing } from '@/constants/theme';
import { MAX_RECENT_RECIPES } from '@/constants/config';
import { isValidVideoUrl } from '@/utils/formatters';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, isSyncing, syncRecipes } = useRecipeStore();
  const [quickUrl, setQuickUrl] = useState('');

  const recent = recipes.slice(0, MAX_RECENT_RECIPES);

  const handleQuickExtract = () => {
    if (!isValidVideoUrl(quickUrl.trim())) return;
    router.push({ pathname: '/(tabs)/add', params: { url: quickUrl.trim() } });
    setQuickUrl('');
  };

  const onRefresh = useCallback(async () => {
    await syncRecipes();
  }, [syncRecipes]);

  const cuisineCounts = recipes.reduce<Record<string, number>>((acc, r) => {
    if (r.cuisine) acc[r.cuisine] = (acc[r.cuisine] ?? 0) + 1;
    return acc;
  }, {});
  const topCuisine = Object.entries(cuisineCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Custom header */}
        <View style={{ paddingHorizontal: Spacing.md, paddingTop: insets.top + 8, paddingBottom: Spacing.md }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 }}>
            RecipeSnap
          </Text>
          {recipes.length > 0 ? (
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2 }}>
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} saved
              {topCuisine ? `  ·  Top: ${topCuisine}` : ''}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 2 }}>
              Your personal recipe collection
            </Text>
          )}
        </View>

        {/* Quick paste bar */}
        <View style={{ paddingHorizontal: Spacing.md, marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 14,
                color: Colors.textPrimary,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
              }}
              placeholder="Paste a recipe video link..."
              placeholderTextColor={Colors.textMuted}
              value={quickUrl}
              onChangeText={setQuickUrl}
              onSubmitEditing={handleQuickExtract}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={handleQuickExtract}
              disabled={!isValidVideoUrl(quickUrl.trim())}
              style={{
                backgroundColor: isValidVideoUrl(quickUrl.trim()) ? Colors.primary : Colors.border,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 11,
              }}
            >
              <Text style={{ color: isValidVideoUrl(quickUrl.trim()) ? '#fff' : Colors.textMuted, fontWeight: '600', fontSize: 14 }}>
                Go
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Recently saved section */}
        {isSyncing && recipes.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.md }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
              Recently Saved
            </Text>
            {[1, 2, 3].map((i) => <RecipeCardSkeleton key={i} />)}
          </View>
        ) : recent.length > 0 ? (
          <View style={{ paddingHorizontal: Spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Recently Saved
              </Text>
              {recipes.length > MAX_RECENT_RECIPES && (
                <Pressable onPress={() => router.push('/(tabs)/library')}>
                  <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '600' }}>View all</Text>
                </Pressable>
              )}
            </View>
            {recent.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32 }}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>👨‍🍳</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
              No recipes yet
            </Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Paste a link from Instagram, TikTok, or YouTube to extract your first recipe.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/add')}
              style={{ marginTop: 24, backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Extract a Recipe</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
