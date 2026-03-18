import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { Colors, Spacing } from '@/constants/theme';
import { Collection, Recipe, TagGroup } from '@/store/types';
import {
  searchRecipes,
  getTagGroups,
  getCollections,
  createCollection,
} from '@/services/api';

const DIFFICULTY_OPTIONS = ['Easy', 'Medium', 'Hard'] as const;
const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: '#10B981',
  Medium: '#F59E0B',
  Hard: '#EF4444',
};
const QUICK_EMOJIS = ['📁', '⭐', '🍽️', '❤️'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterKey(type: string, value: string) {
  return `${type}:${value}`;
}

export default function LibraryScreen() {
  const { recipes, isSyncing, syncRecipes } = useRecipeStore();

  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Map<string, string>>(new Map());
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [tagGroups, setTagGroups] = useState<TagGroup>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [searchResults, setSearchResults] = useState<Recipe[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Boot ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    void Promise.all([
      getTagGroups().then(setTagGroups).catch(() => {}),
      getCollections().then(setCollections).catch(() => {}),
    ]);
  }, []);

  // ── Search trigger ──────────────────────────────────────────────────────────

  const runSearch = useCallback(
    async (q: string, filters: Map<string, string>, collId: number | null, s: 'recent' | 'alpha') => {
      const hasFilter = q.trim() !== '' || filters.size > 0 || collId !== null;
      if (!hasFilter) {
        setSearchResults(null);
        return;
      }
      setIsSearching(true);
      try {
        const params: Record<string, string | number> = { sort: s };
        if (q.trim()) params.q = q.trim();
        if (collId !== null) params.collectionId = collId;
        for (const [key, value] of filters.entries()) {
          const [type] = key.split(':');
          params[type] = value;
        }
        const results = await searchRecipes(params);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Debounce search input; immediate on filter/sort change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(search, activeFilters, activeCollectionId, sort);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    void runSearch(search, activeFilters, activeCollectionId, sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters, activeCollectionId, sort]);

  // ── Filter chip logic ───────────────────────────────────────────────────────

  const toggleFilter = (type: string, value: string) => {
    setActiveFilters((prev) => {
      const next = new Map(prev);
      const key = filterKey(type, value);
      if (next.has(key)) {
        next.delete(key);
      } else {
        // Remove any existing filter for same type
        for (const k of next.keys()) {
          if (k.startsWith(`${type}:`)) next.delete(k);
        }
        next.set(key, value);
      }
      return next;
    });
  };

  const clearAllFilters = () => {
    setActiveFilters(new Map());
    setActiveCollectionId(null);
    setSearch('');
  };

  // ── Collections ─────────────────────────────────────────────────────────────

  const handleNewCollection = () => {
    Alert.prompt(
      'New Collection',
      'Enter a name for your collection',
      async (name) => {
        if (!name?.trim()) return;
        const emoji = QUICK_EMOJIS[Math.floor(Math.random() * QUICK_EMOJIS.length)];
        try {
          const col = await createCollection(name.trim(), emoji);
          setCollections((prev) => [...prev, col]);
        } catch {
          Alert.alert('Error', 'Could not create collection');
        }
      },
      'plain-text'
    );
  };

  // ── Displayed recipes ───────────────────────────────────────────────────────

  const displayedRecipes: Recipe[] = searchResults !== null
    ? searchResults
    : (sort === 'alpha'
        ? [...recipes].sort((a, b) => a.title.localeCompare(b.title))
        : [...recipes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );

  const hasAnyFilter = search.trim() !== '' || activeFilters.size > 0 || activeCollectionId !== null;

  // ── Refresh ─────────────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    await Promise.all([
      syncRecipes(),
      getCollections().then(setCollections).catch(() => {}),
    ]);
    if (hasAnyFilter) {
      void runSearch(search, activeFilters, activeCollectionId, sort);
    }
  }, [syncRecipes, hasAnyFilter, runSearch, search, activeFilters, activeCollectionId, sort]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: Recipe }) => <RecipeCard recipe={item} />;

  const tagFilterTypes = (['cuisine', 'diet', 'method', 'time', 'category'] as const).filter(
    (t) => (tagGroups[t]?.length ?? 0) > 0
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: Colors.surface,
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.md,
          paddingBottom: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 6,
          elevation: 3,
        }}
      >
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ flex: 1, fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 }}>
            My Recipes
          </Text>
          <Pressable
            onPress={() => setSort((s) => (s === 'recent' ? 'alpha' : 'recent'))}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: Colors.background, borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontWeight: '600' }}>
              {sort === 'recent' ? '🕐 Recent' : '🔤 A–Z'}
            </Text>
          </Pressable>
        </View>

        {/* Search bar */}
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

        {/* Difficulty chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 0 }}>
          <View style={{ flexDirection: 'row', gap: 6, paddingRight: 8 }}>
            {DIFFICULTY_OPTIONS.map((d) => {
              const key = filterKey('difficulty', d.toLowerCase());
              const active = activeFilters.has(key);
              const color = DIFFICULTY_COLORS[d];
              return (
                <Pressable
                  key={d}
                  onPress={() => toggleFilter('difficulty', d.toLowerCase())}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                    backgroundColor: active ? color : `${color}18`,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : color }}>
                    {d}
                  </Text>
                  {active && <Text style={{ fontSize: 10, color: '#fff' }}>✕</Text>}
                </Pressable>
              );
            })}

            {/* Dynamic tag chips */}
            {tagFilterTypes.map((type) =>
              (tagGroups[type] ?? []).map((tag) => {
                const key = filterKey(type, tag);
                const active = activeFilters.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleFilter(type, tag)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                      backgroundColor: active ? Colors.primary : `${Colors.primary}14`,
                      borderWidth: active ? 0 : 1,
                      borderColor: `${Colors.primary}30`,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#fff' : Colors.primary }}>
                      {tag}
                    </Text>
                    {active && <Text style={{ fontSize: 10, color: '#fff' }}>✕</Text>}
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Clear all button */}
        {hasAnyFilter && (
          <Pressable onPress={clearAllFilters} style={{ marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>Clear all filters ✕</Text>
          </Pressable>
        )}
      </View>

      {/* ── Collections row ──────────────────────────────────────────────────── */}
      {collections.length > 0 && (
        <View style={{ backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: '#F0EDE8' }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ padding: 10, gap: 8, flexDirection: 'row' }}
          >
            {/* + New card */}
            <Pressable
              onPress={handleNewCollection}
              style={{
                width: 72, height: 72, borderRadius: 14, borderWidth: 1.5,
                borderColor: `${Colors.primary}40`, borderStyle: 'dashed',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 20, color: Colors.primary }}>+</Text>
              <Text style={{ fontSize: 9, color: Colors.primary, fontWeight: '600', marginTop: 2 }}>New</Text>
            </Pressable>

            {collections.map((col) => {
              const active = activeCollectionId === col.id;
              return (
                <Pressable
                  key={col.id}
                  onPress={() => setActiveCollectionId(active ? null : col.id)}
                  style={{
                    width: 72, height: 72, borderRadius: 14,
                    backgroundColor: active ? Colors.primary : Colors.background,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1.5, borderColor: active ? Colors.primary : '#E8E4DF',
                    padding: 6,
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{col.emoji ?? '📁'}</Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 9, fontWeight: '700', color: active ? '#fff' : Colors.textPrimary, marginTop: 2, textAlign: 'center' }}
                  >
                    {col.name}
                  </Text>
                  <View style={{
                    position: 'absolute', top: 4, right: 4,
                    backgroundColor: active ? 'rgba(255,255,255,0.3)' : Colors.primary,
                    borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1,
                  }}>
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: '700' }}>{col.recipeCount}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Recipe list ───────────────────────────────────────────────────────── */}
      {isSyncing && recipes.length === 0 ? (
        <View style={{ padding: Spacing.md }}>
          {[1, 2, 3, 4].map((i) => <RecipeCardSkeleton key={i} />)}
        </View>
      ) : isSearching ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: Colors.textSecondary, fontSize: 14 }}>Searching...</Text>
        </View>
      ) : displayedRecipes.length === 0 ? (
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
                No recipes match your filters
              </Text>
              <Pressable onPress={clearAllFilters} style={{ marginTop: 12 }}>
                <Text style={{ color: Colors.primary, fontWeight: '600', fontSize: 14 }}>Clear filters</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
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
