import { Pressable, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Recipe } from '@/store/types';
import { Colors, Shadow } from '@/constants/theme';

// ── Cuisine theme map ──────────────────────────────────────────────────────────

const CUISINE_MAP: Record<string, { bg: string; emoji: string }> = {
  indian:          { bg: '#E8612A', emoji: '🍛' },
  italian:         { bg: '#22A55E', emoji: '🍝' },
  mexican:         { bg: '#D97706', emoji: '🌮' },
  chinese:         { bg: '#DC2626', emoji: '🥡' },
  japanese:        { bg: '#DB2777', emoji: '🍱' },
  american:        { bg: '#2563EB', emoji: '🍔' },
  french:          { bg: '#7C3AED', emoji: '🥐' },
  thai:            { bg: '#059669', emoji: '🍜' },
  mediterranean:   { bg: '#0891B2', emoji: '🫒' },
  korean:          { bg: '#EA580C', emoji: '🍲' },
  greek:           { bg: '#0284C7', emoji: '🥗' },
  spanish:         { bg: '#B91C1C', emoji: '🥘' },
  'middle eastern':  { bg: '#7C3AED', emoji: '🧆' },
  vietnamese:      { bg: '#15803D', emoji: '🍵' },
};

// Deterministic fallback color from recipe title
const FALLBACK_PALETTE = [
  '#C2410C', '#1D4ED8', '#6D28D9', '#065F46', '#BE185D', '#92400E',
];
function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length];
}

function getCuisineTheme(cuisine: string | null, title: string): { bg: string; emoji: string } {
  if (cuisine) {
    const lower = cuisine.toLowerCase();
    for (const [key, theme] of Object.entries(CUISINE_MAP)) {
      if (lower.includes(key)) return theme;
    }
  }
  return { bg: hashColor(title), emoji: '🍽️' };
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// ── Component ─────────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const { bg, emoji } = getCuisineTheme(recipe.cuisine, recipe.title);

  const totalMins = (() => {
    const parse = (t: string | null) => {
      if (!t) return 0;
      const m = t.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    };
    const total = parse(recipe.prepTime) + parse(recipe.cookTime);
    return total > 0 ? `${total} min` : null;
  })();

  const platformLabel =
    recipe.platform === 'instagram_reel' ? 'Instagram'
    : recipe.platform === 'tiktok' ? 'TikTok'
    : recipe.platform === 'youtube_short' ? 'YouTube'
    : null;

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
        backgroundColor: Colors.surface,
        borderRadius: 20,
        marginBottom: 14,
        overflow: 'hidden',
        ...Shadow.card,
      })}
    >
      {/* ── Colored banner ─────────────────────────────────────────────────── */}
      <View style={{ backgroundColor: bg, height: 92, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40 }}>{emoji}</Text>

        {/* Difficulty pill — top right */}
        <View style={{
          position: 'absolute', top: 10, right: 12,
          backgroundColor: 'rgba(0,0,0,0.28)',
          borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>
            {DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}
          </Text>
        </View>

        {/* Platform pill — top left */}
        {platformLabel && (
          <View style={{
            position: 'absolute', top: 10, left: 12,
            backgroundColor: 'rgba(0,0,0,0.28)',
            borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
          }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#fff', letterSpacing: 0.2 }}>
              {platformLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ── Card body ──────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 13, paddingBottom: 14 }}>
        {/* Title */}
        <Text
          style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, lineHeight: 22, marginBottom: 5 }}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>

        {/* Description */}
        {recipe.description ? (
          <Text
            style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 11 }}
            numberOfLines={2}
          >
            {recipe.description}
          </Text>
        ) : <View style={{ height: 4 }} />}

        {/* ── Meta row ─────────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
          {/* Cuisine chip */}
          {recipe.cuisine && (
            <View style={{
              backgroundColor: `${bg}1A`, borderRadius: 20,
              paddingHorizontal: 9, paddingVertical: 4, marginRight: 8,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: bg }}>{recipe.cuisine}</Text>
            </View>
          )}

          {/* Total time */}
          {totalMins && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 10 }}>
              <Text style={{ fontSize: 13 }}>⏱</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, fontWeight: '500' }}>{totalMins}</Text>
            </View>
          )}

          {/* Ingredient count — pushed to right */}
          <Text style={{ fontSize: 12, color: Colors.textMuted, marginLeft: 'auto' }}>
            {recipe.ingredients.length} ingredients
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
