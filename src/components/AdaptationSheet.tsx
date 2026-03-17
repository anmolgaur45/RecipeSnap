import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import type { AdaptationResult, AdaptationType } from '@/store/types';

const ADAPTATION_EMOJIS: Record<string, string> = {
  vegan: '🌱',
  vegetarian: '🥚',
  'gluten-free': '🌾',
  'dairy-free': '🥛',
  keto: '🥑',
  halal: '✅',
  'nut-free': '🥜',
  custom: '✏️',
};

const ADAPTATION_LABELS: Record<string, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  'gluten-free': 'Gluten-Free',
  'dairy-free': 'Dairy-Free',
  keto: 'Keto',
  halal: 'Halal',
  'nut-free': 'Nut-Free',
  custom: 'Custom',
};

interface AdaptationSheetProps {
  visible: boolean;
  result: AdaptationResult | null;
  adaptationType: AdaptationType | null;
  onSave: () => void;
  onDiscard: () => void;
}

export function AdaptationSheet({
  visible,
  result,
  adaptationType,
  onSave,
  onDiscard,
}: AdaptationSheetProps) {
  if (!result || !adaptationType) return null;

  const emoji = ADAPTATION_EMOJIS[adaptationType] ?? '✨';
  const label = ADAPTATION_LABELS[adaptationType] ?? adaptationType;
  const changeCount = result.changedIngredients?.length ?? 0;
  const isLowConfidence = result.confidenceScore === 'low';

  const handleSave = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave();
  };

  const handleDiscard = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDiscard();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDiscard}>
      {/* Outer column: backdrop (flex:1) sits above the sheet so gestures don't overlap */}
      <View style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={onDiscard}
        />
        <View
          style={{
            backgroundColor: Colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 24, paddingTop: 8, paddingBottom: 40, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Banner */}
            <View
              style={{
                backgroundColor: `${Colors.primary}10`,
                borderRadius: 16,
                padding: 16,
                borderLeftWidth: 4,
                borderLeftColor: Colors.primary,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
                {emoji} {label} Adaptation
              </Text>
              <Text style={{ fontSize: 13, color: Colors.textSecondary }}>
                {changeCount === 0
                  ? 'No ingredient changes needed'
                  : `${changeCount} ingredient${changeCount !== 1 ? 's' : ''} changed`}
              </Text>
              {result.adaptedRecipe && (
                <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                  "{result.adaptedRecipe.title}"
                </Text>
              )}
            </View>

            {/* Low-confidence warning */}
            {isLowConfidence && (
              <View
                style={{
                  backgroundColor: '#FEF3C7',
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <Text style={{ fontSize: 16 }}>⚠️</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 }}>
                  Some substitutions may significantly change this dish. Review carefully before cooking.
                </Text>
              </View>
            )}

            {/* Flavor impact note */}
            {result.flavorImpactNote && (
              <View
                style={{
                  backgroundColor: '#EFF6FF',
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <Text style={{ fontSize: 16 }}>💡</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 }}>
                  {result.flavorImpactNote}
                </Text>
              </View>
            )}

            {/* Changed ingredients diff */}
            {changeCount > 0 && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Ingredient Changes
                </Text>
                {result.changedIngredients!.map((change, i) => (
                  <View
                    key={i}
                    style={{
                      backgroundColor: Colors.background,
                      borderRadius: 12,
                      padding: 14,
                      gap: 6,
                    }}
                  >
                    {/* Old → New */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          color: Colors.textMuted,
                          textDecorationLine: 'line-through',
                        }}
                      >
                        {change.original}
                      </Text>
                      <Text style={{ fontSize: 13, color: Colors.textMuted }}>→</Text>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: '#059669',
                        }}
                      >
                        {change.replacement}
                      </Text>
                    </View>
                    {/* Reason */}
                    <Text style={{ fontSize: 12, color: Colors.textSecondary, lineHeight: 16 }}>
                      {change.reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Adaptation notes */}
            {result.adaptationNotes && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Adaptation Notes
                </Text>
                <Text style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 20 }}>
                  {result.adaptationNotes}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => ({
                  backgroundColor: Colors.primary,
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  Save as New Recipe
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDiscard}
                style={{ paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, color: Colors.textSecondary, fontWeight: '600' }}>
                  Discard
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
