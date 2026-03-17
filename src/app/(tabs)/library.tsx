import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { Colors, Spacing } from '@/constants/theme';
import { Recipe } from '@/store/types';

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Medium', 'Hard'] as const;

const FILTER_COLOR: Record<string, string> = {
  All: Colors.primary,
  Easy: '#10B981',
  Medium: '#F59E0B',
  Hard: '#EF4444',
};

export default function LibraryScreen() {
  const { recipes, isSyncing, syncRecipes } = useRecipeStore();
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');

  const filtered = recipes.filter((r) => {
    const matchesSearch =
      search.trim() === '' ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.ingredients.some((i) => i.item.toLowerCase().includes(search.toLowerCase()));
    const matchesDifficulty =
      difficultyFilter === 'All' ||
      r.difficulty.toLowerCase() === difficultyFilter.toLowerCase();
    return matchesSearch && matchesDifficulty;
  });

  const countForFilter = (f: string) =>
    f === 'All'
      ? recipes.length
      : recipes.filter((r) => r.difficulty.toLowerCase() === f.toLowerCase()).length;

  const onRefresh = useCallback(async () => {
    await syncRecipes();
  }, [syncRecipes]);

  const renderItem = ({ item }: { item: Recipe }) => <RecipeCard recipe={item} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Sticky subheader */}
      <View
        style={{
          backgroundColor: Colors.surface,
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.sm,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 3,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3, marginBottom: 12 }}>
          My Recipes
        </Text>

        <TextInput
          style={{
            backgroundColor: Colors.background,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 14,
            color: Colors.textPrimary,
            marginBottom: 10,
          }}
          placeholder="Search recipes or ingredients..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />

        {/* Filter chips with difficulty colors */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DIFFICULTY_FILTERS.map((f) => {
            const active = difficultyFilter === f;
            const color = FILTER_COLOR[f];
            const count = countForFilter(f);
            return (
              <Pressable
                key={f}
                onPress={() => setDifficultyFilter(f)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: active ? color : `${color}14`,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : color }}>
                  {f} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isSyncing && recipes.length === 0 ? (
        <View style={{ padding: Spacing.md }}>
          {[1, 2, 3, 4].map((i) => <RecipeCardSkeleton key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          {recipes.length === 0 ? (
            <>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📖</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8 }}>
                Your library is empty
              </Text>
              <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                Paste your first recipe link to get started!
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/add')}
                style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Extract a Recipe</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' }}>
                No recipes match your search
              </Text>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md }}
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
