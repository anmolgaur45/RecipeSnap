import { View, Text, Pressable } from 'react-native';
import { Ingredient } from '@/store/types';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';
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
  const { colors: c, isDark } = useTheme();
  const grouped = groupIngredientsByCategory(ingredients);
  const swapColor = '#D9892E';
  const subBg = isDark ? 'rgba(217,137,46,0.16)' : '#FEFCE8';

  return (
    <View style={{ gap: 16 }}>
      {Object.entries(grouped).map(([category, items]) => (
        <View key={category}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 16 }}>{CATEGORY_EMOJI[category] ?? '🍽️'}</Text>
            <Text style={{
              fontSize: 12, fontFamily: Fonts.bodyBold, color: c.textSecondary,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {category}
            </Text>
          </View>
          {items.map((ing) => (
            <View
              key={ing.id}
              style={{
                flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
                borderBottomWidth: 1, borderBottomColor: c.border,
                ...(ing.substituted
                  ? { backgroundColor: subBg, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 6 }
                  : {}),
              }}
            >
              <View style={{
                width: 8, height: 8, borderRadius: 4, marginRight: 12,
                backgroundColor: ing.substituted ? swapColor : c.primary,
              }} />
              <Text
                style={{ fontSize: 14, fontFamily: Fonts.bodySemibold, color: c.textPrimary, marginRight: 4 }}
                accessibilityLabel={`${ing.quantity} ${ing.item}${ing.isOptional ? ', optional' : ''}`}
              >
                {ing.quantity}
              </Text>
              <Text style={{ fontSize: 14, color: c.textPrimary, flex: 1, fontFamily: Fonts.body }}>{ing.item}</Text>
              {ing.substituted && (
                <Text style={{ fontSize: 11, color: swapColor, fontFamily: Fonts.bodySemibold, marginRight: 6 }}>
                  ↕ swapped
                </Text>
              )}
              {ing.isOptional && !ing.substituted && (
                <Text style={{ fontSize: 12, color: c.textMuted, marginLeft: 8, fontStyle: 'italic', fontFamily: Fonts.body }}>
                  optional
                </Text>
              )}
              {onSubstitute && (
                <Pressable
                  onPress={() => onSubstitute(ing)}
                  hitSlop={8}
                  style={{ marginLeft: 6, padding: 2 }}
                  accessibilityLabel={`Substitute ${ing.item}`}
                >
                  <Text style={{ fontSize: 14, color: c.textMuted }}>⇄</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
