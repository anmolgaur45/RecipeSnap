import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import { getSubstitutions } from '@/services/api';
import type {
  Ingredient,
  SubstitutionReason,
  SubstitutionResult,
  SubstitutionSuggestion,
} from '@/store/types';

// ── Reason chips ──────────────────────────────────────────────────────────────

const REASONS: { value: SubstitutionReason; label: string }[] = [
  { value: 'dietary', label: 'Dietary' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'budget', label: 'Budget' },
];

// ── Confidence helpers ────────────────────────────────────────────────────────

const CONFIDENCE_COLOR: Record<string, string> = {
  high: '#10B981',
  medium: '#F59E0B',
  low: '#EF4444',
};

function ConfidenceDots({ level }: { level: 'high' | 'medium' | 'low' }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  const color = CONFIDENCE_COLOR[level];
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i < filled ? color : Colors.border,
          }}
        />
      ))}
      <Text style={{ fontSize: 11, color, fontWeight: '600', marginLeft: 4, textTransform: 'capitalize' }}>
        {level}
      </Text>
    </View>
  );
}

// ── Substitution card ─────────────────────────────────────────────────────────

interface CardProps {
  suggestion: SubstitutionSuggestion;
  onApply: () => void;
}

function SubstitutionCard({ suggestion, onApply }: CardProps) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 10,
      }}
    >
      {/* Name + quantity */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 }}>
          {suggestion.replacement}
        </Text>
        <Text style={{ fontSize: 14, color: Colors.textSecondary, fontWeight: '600', marginLeft: 8 }}>
          {suggestion.quantity}
        </Text>
      </View>

      {/* Quantity note */}
      {suggestion.quantityNote ? (
        <Text style={{ fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' }}>
          {suggestion.quantityNote}
        </Text>
      ) : null}

      {/* Flavor + texture */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
          <Text style={{ fontWeight: '600' }}>{'Flavor  '}</Text>
          {suggestion.flavorImpact}
        </Text>
        <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
          <Text style={{ fontWeight: '600' }}>{'Texture  '}</Text>
          {suggestion.textureImpact}
        </Text>
      </View>

      {/* Best for / not for */}
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 12, color: '#10B981' }}>
          <Text style={{ fontWeight: '700' }}>{'✓ Best for  '}</Text>
          {suggestion.bestFor}
        </Text>
        <Text style={{ fontSize: 12, color: '#EF4444' }}>
          <Text style={{ fontWeight: '700' }}>{'✗ Avoid if  '}</Text>
          {suggestion.notRecommendedFor}
        </Text>
      </View>

      {/* Footer: confidence + apply */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <ConfidenceDots level={suggestion.confidence} />
        <Pressable
          onPress={onApply}
          style={{
            backgroundColor: Colors.primary,
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Apply →</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface SubstitutionSheetProps {
  visible: boolean;
  ingredient: Ingredient | null;
  recipeId: string;
  onClose: () => void;
  onApply: (original: Ingredient, suggestion: SubstitutionSuggestion) => void;
}

export function SubstitutionSheet({
  visible,
  ingredient,
  recipeId,
  onClose,
  onApply,
}: SubstitutionSheetProps) {
  const [reason, setReason] = useState<SubstitutionReason>('dietary');
  const [result, setResult] = useState<SubstitutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !ingredient) return;
    let cancelled = false;

    setResult(null);
    setError(null);
    setLoading(true);

    getSubstitutions(recipeId, ingredient.id, reason)
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((e: unknown) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [visible, ingredient?.id, reason]);

  // Reset reason when sheet closes so it starts fresh next time
  useEffect(() => {
    if (!visible) setReason('dietary');
  }, [visible]);

  const handleApply = (suggestion: SubstitutionSuggestion) => {
    if (!ingredient) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(ingredient, suggestion);
  };

  if (!ingredient) return null;

  const headerIngredient = `${ingredient.quantity} ${ingredient.item}`.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Correct scroll-safe layout: backdrop + sheet as siblings in a column */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Backdrop — only occupies space above the sheet */}
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={onClose}
        />

        {/* Sheet */}
        <View
          style={{
            backgroundColor: Colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
          </View>

          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Substitute for
            </Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: Colors.textPrimary }} numberOfLines={2}>
              {headerIngredient}
            </Text>
          </View>

          {/* Reason chips */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16, flexWrap: 'wrap' }}>
            {REASONS.map(({ value, label }) => {
              const selected = reason === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReason(value);
                  }}
                  style={{
                    borderRadius: 20,
                    paddingVertical: 7,
                    paddingHorizontal: 14,
                    backgroundColor: selected ? Colors.primary : Colors.background,
                    borderWidth: selected ? 0 : 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: selected ? '#fff' : Colors.textSecondary,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: Colors.border, marginHorizontal: 20 }} />

          {/* Body */}
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={{ marginTop: 12, fontSize: 13, color: Colors.textMuted }}>
                Finding substitutes...
              </Text>
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 32, paddingHorizontal: 20, alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 14, color: Colors.error, textAlign: 'center' }}>{error}</Text>
              <Pressable
                onPress={() => {
                  // Force re-fetch by toggling reason back to itself via a tiny state reset
                  setError(null);
                  setLoading(true);
                  if (ingredient) {
                    getSubstitutions(recipeId, ingredient.id, reason)
                      .then(setResult)
                      .catch((e: unknown) => setError((e as Error).message))
                      .finally(() => setLoading(false));
                  }
                }}
                style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Retry</Text>
              </Pressable>
            </View>
          ) : result ? (
            <ScrollView
              style={{ paddingHorizontal: 20, paddingTop: 16 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {result.substitutions.map((s, i) => (
                <SubstitutionCard
                  key={i}
                  suggestion={s}
                  onApply={() => handleApply(s)}
                />
              ))}

              {result.recipeSpecificAdvice ? (
                <View style={{ backgroundColor: `${Colors.primary}0D`, borderRadius: 12, padding: 14, marginTop: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                    Chef note
                  </Text>
                  <Text style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 19, fontStyle: 'italic' }}>
                    {result.recipeSpecificAdvice}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
