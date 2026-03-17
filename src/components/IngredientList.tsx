import { View, Text, Pressable } from 'react-native';
import { Ingredient } from '@/store/types';
import { groupIngredientsByCategory } from '@/utils/formatters';

interface IngredientListProps {
  ingredients: Ingredient[];
  onSubstitute?: (ingredient: Ingredient) => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  produce: '🥦',
  dairy: '🥛',
  protein: '🥩',
  spices: '🫙',
  pantry: '🫙',
  other: '🍽️',
};

export function IngredientList({ ingredients, onSubstitute }: IngredientListProps) {
  const grouped = groupIngredientsByCategory(ingredients);

  return (
    <View className="gap-4">
      {Object.entries(grouped).map(([category, items]) => (
        <View key={category}>
          <View className="flex-row items-center gap-2 mb-2">
            <Text className="text-base">{CATEGORY_EMOJI[category] ?? '🍽️'}</Text>
            <Text className="text-xs font-bold text-text-secondary uppercase tracking-wide capitalize">
              {category}
            </Text>
          </View>
          {items.map((ing) => (
            <View
              key={ing.id}
              className="flex-row items-center py-2 border-b border-border"
              style={ing.substituted ? { backgroundColor: '#FEFCE8', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 6 } : undefined}
            >
              <View className="w-2 h-2 rounded-full bg-primary mr-3 shrink-0" style={ing.substituted ? { backgroundColor: '#D97706' } : undefined} />
              <Text
                className="text-sm font-semibold text-text-primary mr-1 shrink-0"
                accessibilityLabel={`${ing.quantity} ${ing.item}${ing.isOptional ? ', optional' : ''}`}
              >
                {ing.quantity}
              </Text>
              <Text className="text-sm text-text-primary flex-1">{ing.item}</Text>
              {ing.substituted && (
                <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '600', marginRight: 6 }}>
                  ↕ swapped
                </Text>
              )}
              {ing.isOptional && !ing.substituted && (
                <Text className="text-xs text-text-muted ml-2 italic">optional</Text>
              )}
              {onSubstitute && (
                <Pressable
                  onPress={() => onSubstitute(ing)}
                  hitSlop={8}
                  style={{ marginLeft: 6, padding: 2 }}
                  accessibilityLabel={`Substitute ${ing.item}`}
                >
                  <Text style={{ fontSize: 14, color: '#9CA3AF' }}>⇄</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
