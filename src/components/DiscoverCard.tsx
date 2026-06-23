import React from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import type { MealSummary } from '@/services/mealdb';

interface Props {
  meal: MealSummary;
  onPress: (meal: MealSummary) => void;
  isLoading?: boolean;
}

export default function DiscoverCard({ meal, onPress, isLoading }: Props) {
  return (
    <Pressable
      onPress={() => onPress(meal)}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.imageWrap}>
        <Image source={{ uri: meal.strMealThumb }} style={styles.image} resizeMode="cover" />
        {isLoading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
        {/* "+" badge */}
        <View style={styles.plusBadge}>
          <Text style={styles.plusText}>{'+'}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{meal.strMeal}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginRight: 10,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  imageWrap: {
    width: 150,
    height: 108,
    backgroundColor: Colors.border,
  },
  image: { width: 150, height: 108 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBadge: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  body: { padding: 9 },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 16,
  },
});
