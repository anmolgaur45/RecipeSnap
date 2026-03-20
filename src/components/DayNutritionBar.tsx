import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';
import type { DayNutrition } from '@/store/types';

interface Props {
  nutrition: DayNutrition | null;
  compact?: boolean;
}

interface BarConfig {
  label: string;
  key: keyof DayNutrition['totals'];
  color: string;
  unit: string;
}

const BARS: BarConfig[] = [
  { label: 'Cal', key: 'calories', color: '#6B7280', unit: '' },
  { label: 'Protein', key: 'protein', color: '#3B82F6', unit: 'g' },
  { label: 'Carbs', key: 'carbs', color: '#F59E0B', unit: 'g' },
  { label: 'Fat', key: 'fat', color: '#FF6B35', unit: 'g' },
];

export function DayNutritionBar({ nutrition, compact = false }: Props) {
  if (!nutrition || nutrition.totals.calories === 0) {
    return (
      <View style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}>
        <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'center' }}>
          No nutrition data for planned meals
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: Spacing.md, paddingVertical: compact ? 6 : 10, gap: 4 }}>
      {BARS.map(({ label, key, color, unit }) => {
        const pct = Math.min(nutrition.percentages[key], 100);
        const value = nutrition.totals[key];
        const isOver = nutrition.percentages[key] > 100;

        return (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '600',
                color: Colors.textMuted,
                width: compact ? 28 : 38,
              }}
            >
              {label}
            </Text>

            {/* Track */}
            <View
              style={{
                flex: 1,
                height: compact ? 4 : 6,
                backgroundColor: '#F3F4F6',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: isOver ? Colors.error : color,
                  borderRadius: 3,
                }}
              />
            </View>

            {!compact && (
              <Text
                style={{
                  fontSize: 10,
                  color: isOver ? Colors.error : Colors.textMuted,
                  width: 48,
                  textAlign: 'right',
                  fontWeight: isOver ? '700' : '400',
                }}
              >
                {value}
                {unit}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
