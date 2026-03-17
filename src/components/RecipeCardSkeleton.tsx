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
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 8, backgroundColor: Colors.border, opacity },
        style,
      ]}
    />
  );
}

export function RecipeCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
      }}
    >
      {/* Title row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <SkeletonBox width="65%" height={18} />
        <SkeletonBox width={48} height={22} style={{ borderRadius: 12 }} />
      </View>
      {/* Description lines */}
      <SkeletonBox width="100%" height={13} style={{ marginBottom: 6 }} />
      <SkeletonBox width="80%" height={13} style={{ marginBottom: 14 }} />
      {/* Meta row */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SkeletonBox width={64} height={22} style={{ borderRadius: 12 }} />
        <SkeletonBox width={72} height={22} style={{ borderRadius: 12 }} />
      </View>
    </View>
  );
}
