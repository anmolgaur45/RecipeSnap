import { Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Recipe } from '@/store/types';
import { Fonts, Shadow } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';
import { API_URL } from '@/constants/config';

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

const FALLBACK_PALETTE = ['#C2410C', '#1D4ED8', '#6D28D9', '#065F46', '#BE185D', '#92400E'];
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

function getRecipePhoto(recipe: Recipe): string | null {
  if (recipe.thumbnailUrl) {
    return recipe.thumbnailUrl.startsWith('/') ? `${API_URL}${recipe.thumbnailUrl}` : recipe.thumbnailUrl;
  }
  const m = recipe.sourceUrl?.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// ── Component ─────────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const { colors: c } = useTheme();
  const { bg, bg2, emoji } = getCuisineTheme(recipe.cuisine, recipe.title);
  const photoUri = getRecipePhoto(recipe);

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
        backgroundColor: c.surface,
        borderRadius: 20,
        marginBottom: 14,
        overflow: 'hidden',
        ...Shadow.card,
      })}
    >
      {/* ── Banner: photo or gradient ────────────────────────────────────────── */}
      {photoUri ? (
        <View style={styles.banner}>
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          <View style={styles.scrim} />
          {/* Difficulty pill — top right */}
          <View style={styles.pillRight}>
            <Text style={styles.pillText}>{DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}</Text>
          </View>
          {/* Platform pill — top left */}
          {platformLabel && (
            <View style={styles.pillLeft}>
              <Text style={styles.pillText}>{platformLabel}</Text>
            </View>
          )}
        </View>
      ) : (
        <LinearGradient
          colors={[bg, bg2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={styles.pillRight}>
            <Text style={styles.pillText}>{DIFFICULTY_LABEL[recipe.difficulty] ?? recipe.difficulty}</Text>
          </View>
          {platformLabel && (
            <View style={styles.pillLeft}>
              <Text style={styles.pillText}>{platformLabel}</Text>
            </View>
          )}
        </LinearGradient>
      )}

      {/* ── Card body ──────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 13, paddingBottom: 14 }}>
        {/* Title */}
        <Text
          style={{ fontSize: 16, fontFamily: Fonts.bodyBold, color: c.textPrimary, lineHeight: 22, marginBottom: 5 }}
          numberOfLines={2}
        >
          {recipe.title}
        </Text>

        {/* Description */}
        {recipe.description ? (
          <Text
            style={{ fontSize: 13, fontFamily: Fonts.body, color: c.textSecondary, lineHeight: 18, marginBottom: 11 }}
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
              <Text style={{ fontSize: 11, fontFamily: Fonts.bodyBold, color: bg }}>{recipe.cuisine}</Text>
            </View>
          )}

          {/* Total time */}
          {totalMins && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginRight: 10 }}>
              <Text style={{ fontSize: 13 }}>⏱</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, fontFamily: Fonts.bodyMedium }}>{totalMins}</Text>
            </View>
          )}

          {/* Ingredient count — pushed to right */}
          <Text style={{ fontSize: 12, color: c.textMuted, fontFamily: Fonts.body, marginLeft: 'auto' }}>
            {recipe.ingredients.length} ingredients
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  emoji: { fontSize: 40 },
  pillRight: {
    position: 'absolute', top: 10, right: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  pillLeft: {
    position: 'absolute', top: 10, left: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  pillText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});
