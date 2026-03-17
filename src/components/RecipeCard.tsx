import { Pressable, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Recipe } from '@/store/types';
import { Colors, Shadow } from '@/constants/theme';

interface RecipeCardProps {
  recipe: Recipe;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444',
};

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1,
        backgroundColor: Colors.surface,
        borderRadius: 16,
        marginBottom: 12,
        flexDirection: 'row',
        overflow: 'hidden',
        ...Shadow.card,
      })}
    >
      {/* Left accent bar — difficulty color */}
      <View
        style={{
          width: 4,
          backgroundColor: DIFFICULTY_COLOR[recipe.difficulty] ?? Colors.primary,
        }}
      />

      {/* Card content */}
      <View style={{ flex: 1, padding: 14 }}>
        {/* Title + difficulty pill */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text
            style={{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, paddingRight: 8 }}
            numberOfLines={2}
          >
            {recipe.title}
          </Text>
          <View
            style={{
              backgroundColor: `${DIFFICULTY_COLOR[recipe.difficulty]}18`,
              borderRadius: 20,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: DIFFICULTY_COLOR[recipe.difficulty], textTransform: 'capitalize' }}>
              {recipe.difficulty}
            </Text>
          </View>
        </View>

        {/* Description */}
        {recipe.description && (
          <Text
            style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: 10 }}
            numberOfLines={2}
          >
            {recipe.description}
          </Text>
        )}

        {/* Meta row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {recipe.cuisine && (
            <View style={{ backgroundColor: `${Colors.primary}14`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.primary }}>{recipe.cuisine}</Text>
            </View>
          )}
          {recipe.cookTime && (
            <Text style={{ fontSize: 12, color: Colors.textMuted }}>🔥 {recipe.cookTime}</Text>
          )}
          {recipe.prepTime && (
            <Text style={{ fontSize: 12, color: Colors.textMuted }}>⏱ {recipe.prepTime}</Text>
          )}
          <Text style={{ fontSize: 12, color: Colors.textMuted, marginLeft: 'auto' }}>
            {recipe.ingredients.length} ingredients
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
