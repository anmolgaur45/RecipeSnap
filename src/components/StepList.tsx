import { View, Text } from 'react-native';
import { RecipeStep } from '@/store/types';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';

interface StepListProps {
  steps: RecipeStep[];
}

export function StepList({ steps }: StepListProps) {
  const { colors: c } = useTheme();
  return (
    <View style={{ gap: 16 }}>
      {steps.map((step) => (
        <View key={step.stepNumber} style={{ flexDirection: 'row', gap: 12 }}>
          {/* Step number bubble */}
          <View
            style={{
              width: 28, height: 28, borderRadius: 14, alignItems: 'center',
              justifyContent: 'center', marginTop: 2, backgroundColor: c.primary,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: Fonts.bodyBold, color: '#fff' }}>{step.stepNumber}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 14, color: c.textPrimary, lineHeight: 21, flex: 1, fontFamily: Fonts.body }}>
                {step.instruction}
              </Text>
              {step.duration && (
                <View style={{
                  backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border,
                  borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 4,
                }}>
                  <Text style={{ fontSize: 12, color: c.textSecondary, fontFamily: Fonts.body }}>⏱ {step.duration}</Text>
                </View>
              )}
            </View>

            {step.tip && (
              <View style={{ marginTop: 8, borderRadius: 12, padding: 12, backgroundColor: c.primary + '14' }}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.bodySemibold, color: c.primary, marginBottom: 2 }}>💡 Tip</Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 17, fontFamily: Fonts.body }}>{step.tip}</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
