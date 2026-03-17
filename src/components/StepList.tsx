import { View, Text } from 'react-native';
import { RecipeStep } from '@/store/types';
import { Colors } from '@/constants/theme';

interface StepListProps {
  steps: RecipeStep[];
}

export function StepList({ steps }: StepListProps) {
  return (
    <View className="gap-4">
      {steps.map((step) => (
        <View key={step.stepNumber} className="flex-row gap-3">
          {/* Step number bubble */}
          <View
            className="w-7 h-7 rounded-full items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: Colors.primary }}
          >
            <Text className="text-xs font-bold text-white">{step.stepNumber}</Text>
          </View>

          <View className="flex-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="text-sm text-text-primary leading-5 flex-1">
                {step.instruction}
              </Text>
              {step.duration && (
                <View className="bg-background border border-border rounded-full px-2.5 py-1 shrink-0 ml-1">
                  <Text className="text-xs text-text-secondary">⏱ {step.duration}</Text>
                </View>
              )}
            </View>

            {step.tip && (
              <View
                className="mt-2 rounded-xl p-3"
                style={{ backgroundColor: `${Colors.primary}12` }}
              >
                <Text className="text-xs font-semibold text-primary mb-1">💡 Tip</Text>
                <Text className="text-xs text-text-secondary leading-4">{step.tip}</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
