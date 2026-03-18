import { View, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors } from '@/constants/theme';

function SkeletonBox({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: 8, backgroundColor: Colors.border, opacity }, style]}
    />
  );
}

export function RecipeCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 20,
        marginBottom: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      {/* Banner placeholder */}
      <SkeletonBox width="100%" height={92} style={{ borderRadius: 0 }} />

      {/* Body */}
      <View style={{ paddingHorizontal: 16, paddingTop: 13, paddingBottom: 14 }}>
        <SkeletonBox width="75%" height={17} style={{ marginBottom: 8 }} />
        <SkeletonBox width="100%" height={13} style={{ marginBottom: 5 }} />
        <SkeletonBox width="60%" height={13} style={{ marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SkeletonBox width={60} height={22} style={{ borderRadius: 20 }} />
          <SkeletonBox width={70} height={22} style={{ borderRadius: 20 }} />
        </View>
      </View>
    </View>
  );
}
