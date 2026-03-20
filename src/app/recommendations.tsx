import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import { RecipeRecommendationCard } from '@/components/RecipeRecommendationCard';
import {
  getPantryMatches,
  getAISuggestions,
  getExpiringAlerts,
  type RecipeRecommendation,
  type AISuggestedRecipe,
  type ExpiringAlert,
} from '@/services/recommend';
import { API_URL } from '@/constants/config';

export default function RecommendationsScreen() {
  const insets = useSafeAreaInsets();

  const [ready, setReady] = useState<RecipeRecommendation[]>([]);
  const [almost, setAlmost] = useState<RecipeRecommendation[]>([]);
  const [alerts, setAlerts] = useState<ExpiringAlert[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestedRecipe[]>([]);

  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matches, expiryAlerts] = await Promise.all([
        getPantryMatches({ limit: 30, prioritizeExpiring: true }),
        getExpiringAlerts(),
      ]);
      setReady(matches.filter((r) => r.category === 'ready'));
      setAlmost(matches.filter((r) => r.category === 'almost'));
      setAlerts(expiryAlerts);
    } catch {
      setError('Could not load recommendations. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadAISuggestions = async () => {
    setAiLoading(true);
    try {
      const suggestions = await getAISuggestions(alerts.length > 0);
      setAiSuggestions(suggestions);
    } catch {
      Alert.alert('Error', 'Failed to get AI suggestions. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddMissing = async (missingItems: string[]) => {
    try {
      // Create a grocery list with the missing items
      const createRes = await fetch(`${API_URL}/api/grocery-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Missing Ingredients' }),
      });
      if (!createRes.ok) throw new Error('Failed to create grocery list');
      const list = await createRes.json() as { id: number };

      // Add each missing item
      await Promise.all(
        missingItems.map((item) =>
          fetch(`${API_URL}/api/grocery-lists/${list.id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item }),
          })
        )
      );

      Alert.alert(
        'Added to Grocery List',
        `${missingItems.length} item${missingItems.length !== 1 ? 's' : ''} added.`,
        [{ text: 'View List', onPress: () => router.push('/(tabs)/grocery') }, { text: 'OK' }]
      );
    } catch {
      Alert.alert('Error', 'Could not add items to grocery list.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>What Can I Cook?</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Checking your pantry…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>What Can I Cook?</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const hasResults = ready.length > 0 || almost.length > 0 || alerts.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>What Can I Cook?</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Empty state */}
        {!hasResults && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🧑‍🍳</Text>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyDesc}>
              Add items to your pantry to see which recipes you can cook with what you have.
            </Text>
          </View>
        )}

        {/* ── Expiry Alerts ───────────────────────────────── */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>⚠️</Text>
              <Text style={styles.sectionTitle}>Use It or Lose It</Text>
            </View>
            <Text style={styles.sectionSub}>
              {alerts.length} pantry item{alerts.length !== 1 ? 's' : ''} expiring soon
            </Text>
            {alerts.map((alert) => (
              <View key={alert.pantryItemId} style={styles.alertCard}>
                <View style={styles.alertHeader}>
                  <View style={[
                    styles.alertDot,
                    { backgroundColor: alert.expiryStatus === 'expired' ? Colors.error : Colors.warning },
                  ]} />
                  <Text style={styles.alertName}>{alert.pantryItemName}</Text>
                  {alert.expiresAt && (
                    <Text style={styles.alertDate}>
                      {alert.expiryStatus === 'expired' ? 'Expired' : 'Expires'}{' '}
                      {new Date(alert.expiresAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  )}
                </View>
                {alert.matchedRecipes.length > 0 && (
                  <View style={styles.alertRecipes}>
                    <Text style={styles.alertRecipesLabel}>Recipes that use this:</Text>
                    {alert.matchedRecipes.map((r) => (
                      <Pressable
                        key={r.recipeId}
                        onPress={() => router.push(`/recipe/${r.recipeId}`)}
                        style={styles.alertRecipeRow}
                      >
                        <Text style={styles.alertRecipeTitle}>{r.recipeTitle}</Text>
                        <Text style={styles.alertRecipePct}>{r.matchPercentage}% match</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Ready to Cook ───────────────────────────────── */}
        {ready.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>✅</Text>
              <Text style={styles.sectionTitle}>Ready to Cook</Text>
            </View>
            <Text style={styles.sectionSub}>You have all the ingredients</Text>
            {ready.map((rec) => (
              <RecipeRecommendationCard key={rec.recipeId} rec={rec} />
            ))}
          </View>
        )}

        {/* ── Almost There ────────────────────────────────── */}
        {almost.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionEmoji}>🛒</Text>
              <Text style={styles.sectionTitle}>Almost There</Text>
            </View>
            <Text style={styles.sectionSub}>Missing just a few ingredients</Text>
            {almost.map((rec) => (
              <RecipeRecommendationCard
                key={rec.recipeId}
                rec={rec}
                onAddMissing={handleAddMissing}
              />
            ))}
          </View>
        )}

        {/* ── AI Suggestions ──────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionEmoji}>✨</Text>
            <Text style={styles.sectionTitle}>AI Recipe Ideas</Text>
          </View>
          <Text style={styles.sectionSub}>New recipes based on your pantry</Text>

          {aiSuggestions.length === 0 ? (
            <Pressable
              style={[styles.aiBtn, aiLoading && styles.aiBtnDisabled]}
              onPress={loadAISuggestions}
              disabled={aiLoading}
            >
              {aiLoading ? (
                <ActivityIndicator size="small" color={Colors.surface} />
              ) : (
                <Text style={styles.aiBtnText}>✨ Get AI Suggestions</Text>
              )}
            </Pressable>
          ) : (
            <>
              {aiSuggestions.map((s, idx) => (
                <AISuggestionCard key={idx} suggestion={s} />
              ))}
              <Pressable
                style={[styles.aiBtn, styles.aiBtnOutline, aiLoading && styles.aiBtnDisabled]}
                onPress={loadAISuggestions}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={[styles.aiBtnText, { color: Colors.primary }]}>↻ Regenerate</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── AI Suggestion Card ────────────────────────────────────────────────────────

function AISuggestionCard({ suggestion }: { suggestion: AISuggestedRecipe }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={styles.aiCard}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.aiCardHeader}>
        <View style={styles.aiCardMeta}>
          <Text style={styles.aiCardTitle}>{suggestion.title}</Text>
          <Text style={styles.aiCardDesc} numberOfLines={expanded ? 0 : 2}>
            {suggestion.description}
          </Text>
          <View style={styles.aiCardChips}>
            <Text style={styles.metaChip}>{suggestion.cuisine}</Text>
            <Text style={styles.metaChip}>⏱ {suggestion.cookTime}</Text>
            <Text style={styles.metaChip}>{suggestion.difficulty}</Text>
          </View>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {expanded && (
        <View style={styles.aiCardBody}>
          <Text style={styles.aiCardSectionLabel}>Ingredients</Text>
          {suggestion.ingredients.map((ing, i) => (
            <Text key={i} style={styles.aiCardItem}>
              • {ing.quantity} {ing.item}
            </Text>
          ))}
          <Text style={[styles.aiCardSectionLabel, { marginTop: Spacing.sm }]}>Steps</Text>
          {suggestion.steps.map((step, i) => (
            <Text key={i} style={styles.aiCardStep}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
  },
  backText: {
    fontSize: FontSize.xl,
    color: Colors.primary,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  errorEmoji: {
    fontSize: 48,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  retryText: {
    color: Colors.surface,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyEmoji: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 20,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  sectionEmoji: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  alertCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
    ...Shadow.sm,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertName: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  alertDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  alertRecipes: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  alertRecipesLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  alertRecipeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  alertRecipeTitle: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
    flex: 1,
  },
  alertRecipePct: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  aiBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  aiBtnOutline: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginTop: Spacing.sm,
  },
  aiBtnDisabled: {
    opacity: 0.6,
  },
  aiBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.surface,
  },
  aiCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadow.card,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  aiCardMeta: {
    flex: 1,
    gap: 4,
  },
  aiCardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  aiCardDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  aiCardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  metaChip: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    backgroundColor: Colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  expandIcon: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingTop: 4,
  },
  aiCardBody: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 2,
  },
  aiCardSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  aiCardItem: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  aiCardStep: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 2,
  },
});
