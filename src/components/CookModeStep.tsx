import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import type { RecipeStep } from '@/store/types';

interface Props {
  step: RecipeStep;
  stepIndex: number;
  totalSteps: number;
}

export default function CookModeStep({ step, stepIndex, totalSteps }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        {/* Step badge */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              Step {stepIndex + 1} of {totalSteps}
            </Text>
          </View>
        </View>

        {/* Instruction */}
        <Text style={styles.instruction}>{step.instruction}</Text>

        {/* Duration chip */}
        {step.duration ? (
          <View style={styles.durationChip}>
            <Text style={styles.durationText}>{'🕐 ' + step.duration}</Text>
          </View>
        ) : null}

        {/* Tip box */}
        {step.tip ? (
          <View style={styles.tipBox}>
            <Text style={styles.tipLabel}>{'💡 Chef\'s tip'}</Text>
            <Text style={styles.tipText}>{step.tip}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  badgeRow: {
    marginBottom: Spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  badgeText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  instruction: {
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    lineHeight: FontSize.xl * 1.55,
    fontWeight: '500',
    marginBottom: Spacing.lg,
  },
  durationChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  durationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tipBox: {
    backgroundColor: '#FFF3ED',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  tipLabel: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  tipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.5,
  },
});
