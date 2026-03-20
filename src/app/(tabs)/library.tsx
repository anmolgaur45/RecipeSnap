import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ScrollView,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { PantryView } from '@/components/PantryView';
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
const QUICK_EMOJIS = ['📁', '⭐', '🍽️', '❤️', '🌿', '🔥'];

function filterKey(type: string, value: string) {
  return `${type}:${value}`;
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { recipes, isSyncing, syncRecipes } = useRecipeStore();

  const [activeSegment, setActiveSegment] = useState<'recipes' | 'pantry'>('recipes');
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Map<string, string>>(new Map());
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [tagGroups, setTagGroups] = useState<TagGroup>({});
  const [collections, setCollections] = useState<Collection[]>([]);
  const [searchResults, setSearchResults] = useState<Recipe[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
  const [showNewColInput, setShowNewColInput] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [creatingCol, setCreatingCol] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void Promise.all([
      getTagGroups().then(setTagGroups).catch(() => {}),
      getCollections().then(setCollections).catch(() => {}),
    ]);
  }, []);

  const runSearch = useCallback(
    async (q: string, filters: Map<string, string>, collId: number | null, s: 'recent' | 'alpha') => {
      const hasFilter = q.trim() !== '' || filters.size > 0 || collId !== null;
      if (!hasFilter) { setSearchResults(null); return; }
      setIsSearching(true);
      try {
        const params: Record<string, string | number> = { sort: s };
        if (q.trim()) params.q = q.trim();
        if (collId !== null) params.collectionId = collId;
        for (const [key, value] of filters.entries()) {
          const [type] = key.split(':');
          params[type] = value;
        }
        setSearchResults(await searchRecipes(params));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

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

  const toggleFilter = (type: string, value: string) => {
    setActiveFilters((prev) => {
      const next = new Map(prev);
      const key = filterKey(type, value);
      if (next.has(key)) {
        next.delete(key);
      } else {
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

  const handleNewCollection = async () => {
    if (!newColName.trim()) return;
    setCreatingCol(true);
    const emoji = QUICK_EMOJIS[Math.floor(Math.random() * QUICK_EMOJIS.length)];
    try {
      const col = await createCollection(newColName.trim(), emoji);
      setCollections((prev) => [...prev, col]);
      setNewColName('');
      setShowNewColInput(false);
    } catch {
      Alert.alert('Error', 'Could not create collection');
    } finally {
      setCreatingCol(false);
    }
  };

  const displayedRecipes: Recipe[] = searchResults !== null
    ? searchResults
    : (sort === 'alpha'
        ? [...recipes].sort((a, b) => a.title.localeCompare(b.title))
        : [...recipes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );

  const hasAnyFilter = search.trim() !== '' || activeFilters.size > 0 || activeCollectionId !== null;

  const onRefresh = useCallback(async () => {
    await Promise.all([
      syncRecipes(),
      getCollections().then(setCollections).catch(() => {}),
    ]);
    if (hasAnyFilter) void runSearch(search, activeFilters, activeCollectionId, sort);
  }, [syncRecipes, hasAnyFilter, runSearch, search, activeFilters, activeCollectionId, sort]);

  const tagFilterTypes = (['cuisine', 'diet', 'method', 'time', 'category'] as const).filter(
    (t) => (tagGroups[t]?.length ?? 0) > 0
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <View style={{
        backgroundColor: Colors.surface,
        paddingHorizontal: Spacing.md,
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 4,
      }}>
        {/* Segment control */}
        <View style={{ flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {(['recipes', 'pantry'] as const).map((seg) => (
            <Pressable
              key={seg}
              onPress={() => setActiveSegment(seg)}
              style={{
                flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center',
                backgroundColor: activeSegment === seg ? Colors.surface : 'transparent',
                shadowColor: activeSegment === seg ? '#000' : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
                elevation: activeSegment === seg ? 2 : 0,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={{ fontSize: 15 }}>{seg === 'recipes' ? '📚' : '🥫'}</Text>
                <Text style={{
                  fontSize: 14, fontWeight: '700',
                  color: activeSegment === seg ? Colors.textPrimary : Colors.textMuted,
                }}>
                  {seg === 'recipes' ? 'Recipes' : 'Pantry'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Pantry title — only when pantry segment active */}
        {activeSegment === 'pantry' && (
          <View style={{ paddingBottom: 4 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 }}>
              My Pantry
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 1 }}>
              Track ingredients &amp; reduce waste
            </Text>
          </View>
        )}

        {/* Title row + search + filters — only for recipes segment */}
        {activeSegment === 'recipes' && (<>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 }}>
              My Recipes
            </Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 1 }}>
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} saved
            </Text>
          </View>
          {/* Sort toggle */}
          <Pressable
            onPress={() => setSort((s) => (s === 'recent' ? 'alpha' : 'recent'))}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: Colors.background,
              borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
              borderWidth: 1, borderColor: Colors.border,
            }}
          >
            <Text style={{ fontSize: 13 }}>{sort === 'recent' ? '⏱' : '🔤'}</Text>
            <Text style={{ fontSize: 12, color: Colors.textSecondary, fontWeight: '600' }}>
              {sort === 'recent' ? 'Recent' : 'A–Z'}
            </Text>
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: Colors.background,
          borderRadius: 14, paddingHorizontal: 13, marginBottom: 12,
          borderWidth: 1, borderColor: Colors.border,
        }}>
          <Text style={{ fontSize: 15, color: Colors.textMuted, marginRight: 8 }}>🔍</Text>
          <TextInput
            style={{ flex: 1, paddingVertical: 11, fontSize: 14, color: Colors.textPrimary }}
            placeholder="Search recipes or ingredients..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Text style={{ fontSize: 16, color: Colors.textMuted }}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 7, paddingRight: 8 }}>
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
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: active ? color : Colors.surface,
                    borderWidth: 1.5,
                    borderColor: active ? color : `${color}60`,
                  }}
                >
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? '#fff' : color }} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : color }}>
                    {d}
                  </Text>
                </Pressable>
              );
            })}

            {/* Separator */}
            {tagFilterTypes.length > 0 && (
              <View style={{ width: 1, backgroundColor: Colors.border, marginHorizontal: 2, borderRadius: 1 }} />
            )}

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
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                      backgroundColor: active ? Colors.primary : Colors.surface,
                      borderWidth: 1.5,
                      borderColor: active ? Colors.primary : `${Colors.primary}50`,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#fff' : Colors.primary }}>
                      {tag}
                    </Text>
                    {active && <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>✕</Text>}
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Active filter summary */}
        {hasAnyFilter && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: Colors.textMuted }}>
              {displayedRecipes.length} result{displayedRecipes.length !== 1 ? 's' : ''}
            </Text>
            <Pressable
              onPress={clearAllFilters}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${Colors.primary}14`,
                borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>Clear filters</Text>
              <Text style={{ fontSize: 11, color: Colors.primary }}>✕</Text>
            </Pressable>
          </View>
        )}
        </>)}
      </View>

      {/* ── Collections row ──────────────────────────────────────────────────── */}
      {activeSegment === 'recipes' && (<View style={{
        backgroundColor: Colors.surface,
        borderBottomWidth: 1, borderBottomColor: '#EDEBE6',
        paddingVertical: 10,
      }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8, flexDirection: 'row', alignItems: 'center' }}
        >
          {/* + New button or inline input */}
          {showNewColInput ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput
                autoFocus
                value={newColName}
                onChangeText={setNewColName}
                placeholder="Collection name..."
                placeholderTextColor={Colors.textMuted}
                style={{
                  width: 140, backgroundColor: Colors.background,
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                  fontSize: 13, color: Colors.textPrimary,
                  borderWidth: 1.5, borderColor: Colors.primary,
                }}
                returnKeyType="done"
                onSubmitEditing={() => { void handleNewCollection(); }}
              />
              <Pressable
                onPress={() => { void handleNewCollection(); }}
                disabled={creatingCol || !newColName.trim()}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 8,
                  opacity: creatingCol || !newColName.trim() ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                  {creatingCol ? '...' : 'Create'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowNewColInput(false); setNewColName(''); }}
                hitSlop={8}
              >
                <Text style={{ color: Colors.textMuted, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowNewColInput(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
                borderWidth: 1.5, borderColor: `${Colors.primary}50`,
                borderStyle: 'dashed', backgroundColor: `${Colors.primary}08`,
              }}
            >
              <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: '700' }}>+</Text>
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>New</Text>
            </Pressable>
          )}

          {/* Collection chips */}
          {collections.map((col) => {
            const active = activeCollectionId === col.id;
            return (
              <Pressable
                key={col.id}
                onPress={() => setActiveCollectionId(active ? null : col.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? Colors.primary : Colors.background,
                  borderWidth: 1.5,
                  borderColor: active ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{ fontSize: 14 }}>{col.emoji ?? '📁'}</Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 13, fontWeight: '600', maxWidth: 110,
                    color: active ? '#fff' : Colors.textPrimary,
                  }}
                >
                  {col.name}
                </Text>
                <View style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.25)' : `${Colors.primary}18`,
                  borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2,
                  minWidth: 20, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : Colors.primary }}>
                    {col.recipeCount}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>)}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {activeSegment === 'pantry' ? (
        <PantryView />
      ) : isSyncing && recipes.length === 0 ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <RecipeCardSkeleton />}
          contentContainerStyle={{ padding: Spacing.md }}
          scrollEnabled={false}
        />
      ) : isSearching ? (
        <FlatList
          data={[1, 2, 3]}
          keyExtractor={(i) => String(i)}
          renderItem={() => <RecipeCardSkeleton />}
          contentContainerStyle={{ padding: Spacing.md }}
          scrollEnabled={false}
        />
      ) : displayedRecipes.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          {recipes.length === 0 ? (
            <>
              <Text style={{ fontSize: 56, marginBottom: 16 }}>📖</Text>
              <Text style={{ fontSize: 21, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: 8, letterSpacing: -0.3 }}>
                Your library is empty
              </Text>
              <Text style={{ fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 21 }}>
                Save your first recipe by pasting a link on the Extract tab
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/add')}
                style={{
                  backgroundColor: Colors.primary, borderRadius: 16,
                  paddingHorizontal: 28, paddingVertical: 14,
                  shadowColor: Colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  elevation: 6,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Extract a Recipe</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 44, marginBottom: 12 }}>🔍</Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: 6 }}>
                No matches found
              </Text>
              <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 }}>
                Try adjusting your search or filters
              </Text>
              <Pressable
                onPress={clearAllFilters}
                style={{
                  backgroundColor: `${Colors.primary}14`,
                  borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9,
                }}
              >
                <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Clear all filters</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          renderItem={({ item }) => <RecipeCard recipe={item} />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md }}
          refreshControl={
            <RefreshControl refreshing={isSyncing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
