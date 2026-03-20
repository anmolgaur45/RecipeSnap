import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import type { RecipeRecommendation } from '@/services/recommend';

// ── Cuisine emoji map ─────────────────────────────────────────────────────────

const CUISINE_EMOJI: Record<string, string> = {
  italian: '🍝', mexican: '🌮', chinese: '🥡', japanese: '🍱',
  indian: '🍛', thai: '🍜', french: '🥐', american: '🍔',
  mediterranean: '🫒', korean: '🍲', greek: '🥗', spanish: '🥘',
  vietnamese: '🍃', middle_eastern: '🧆', turkish: '🥙',
};

function getCuisineEmoji(cuisine: string | null): string {
  if (!cuisine) return '🍽️';
  const key = cuisine.toLowerCase().replace(/\s+/g, '_');
  return CUISINE_EMOJI[key] ?? '🍽️';
}

// ── Match ring ────────────────────────────────────────────────────────────────

function MatchRing({ pct, category }: { pct: number; category: string }) {
  const color =
    category === 'ready' ? Colors.success
    : category === 'almost' ? Colors.warning
    : '#9CA3AF';

  return (
    <View style={[styles.ring, { borderColor: color }]}>
      <Text style={[styles.ringText, { color }]}>{pct}</Text>
      <Text style={[styles.ringPct, { color }]}>%</Text>
    </View>
  );
}

// ── Category badge ────────────────────────────────────────────────────────────

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  ready:          { label: '✓ Ready', bg: '#D1FAE5', fg: '#065F46' },
  almost:         { label: '~ Almost', bg: '#FEF3C7', fg: '#92400E' },
  needs_shopping: { label: '✕ Missing', bg: '#F3F4F6', fg: '#374151' },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  rec: RecipeRecommendation;
  onAddMissing?: (missingItems: string[]) => void;
}

export function RecipeRecommendationCard({ rec, onAddMissing }: Props) {
  const badge = BADGE[rec.category];
  const emoji = getCuisineEmoji(rec.recipeCuisine);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      onPress={() => router.push(`/recipe/${rec.recipeId}`)}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.emojiBox}>
          <Text style={styles.emojiText}>{emoji}</Text>
        </View>

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>{rec.recipeTitle}</Text>
          <View style={styles.metaRow}>
            {rec.recipeTime ? (
              <Text style={styles.metaChip}>🕐 {rec.recipeTime}</Text>
            ) : null}
            <Text style={styles.metaChip}>
              {rec.recipeDifficulty === 'easy' ? '🟢' : rec.recipeDifficulty === 'medium' ? '🟡' : '🔴'}
              {' '}{rec.recipeDifficulty}
            </Text>
            {rec.recipeCuisine ? (
              <Text style={styles.metaChip}>{rec.recipeCuisine}</Text>
            ) : null}
          </View>
        </View>

        <MatchRing pct={rec.matchPercentage} category={rec.category} />
      </View>

      {/* Status badge + expiry badge */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
        </View>
        {rec.usesExpiringItems && (
          <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.badgeText, { color: '#92400E' }]}>
              ⚠️ Uses expiring items
            </Text>
          </View>
        )}
      </View>

      {/* Missing ingredients (only for 'almost') */}
      {rec.category === 'almost' && rec.missingIngredients.length > 0 && (
        <View style={styles.missingBox}>
          <Text style={styles.missingLabel}>Missing:</Text>
          <Text style={styles.missingItems} numberOfLines={2}>
            {rec.missingIngredients.slice(0, 4).join(', ')}
            {rec.missingIngredients.length > 4 ? ` +${rec.missingIngredients.length - 4} more` : ''}
          </Text>
          {onAddMissing && (
            <Pressable
              style={styles.addMissingBtn}
              onPress={() => onAddMissing(rec.missingIngredients)}
            >
              <Text style={styles.addMissingText}>+ Add to grocery list</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  emojiBox: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 26,
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  metaChip: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    backgroundColor: Colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  ring: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  ringText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ringPct: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  missingBox: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  missingLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  missingItems: {
    fontSize: FontSize.xs,
    color: '#78350F',
    lineHeight: 16,
  },
  addMissingBtn: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
  },
  addMissingText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
});
