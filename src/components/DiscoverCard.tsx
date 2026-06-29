import React, { useMemo } from 'react';
import { View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Shadow, Fonts, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';
import type { MealSummary } from '@/services/mealdb';

interface Props {
  meal: MealSummary;
  onPress: (meal: MealSummary) => void;
  isLoading?: boolean;
}

export default function DiscoverCard({ meal, onPress, isLoading }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    width: 150,
    backgroundColor: c.surface,
    borderRadius: 14,
    marginRight: 10,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  imageWrap: { width: 150, height: 108, backgroundColor: c.surfaceAlt },
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
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { color: '#fff', fontSize: 18, fontFamily: Fonts.bodyBold, lineHeight: 22 },
  body: { padding: 9 },
  title: { fontSize: 12, fontFamily: Fonts.bodySemibold, color: c.textPrimary, lineHeight: 16 },
});
