import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/store/themeStore';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_SERVINGS = 50;
const LONG_PRESS_INTERVAL_MS = 150;

interface ServingScalerProps {
  originalServings: number;
  currentServings: number;
  onServingChange: (servings: number) => void;
  onSaveDefault: () => void;
  isSaving: boolean;
  isScaling: boolean;
}

export function ServingScaler({
  originalServings,
  currentServings,
  onServingChange,
  onSaveDefault,
  isSaving,
  isScaling,
}: ServingScalerProps) {
  const { colors: c } = useTheme();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const servingsRef = useRef(currentServings);

  // Keep ref in sync so long-press intervals can read latest value
  useEffect(() => {
    servingsRef.current = currentServings;
  }, [currentServings]);

  // Animate the "Save as default" row in/out
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [currentServings === originalServings]);

  const clearLongPress = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleDecrement = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentServings > 1) onServingChange(currentServings - 1);
  };

  const handleIncrement = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentServings >= MAX_SERVINGS) {
      Alert.alert('Maximum reached', `Serving size is capped at ${MAX_SERVINGS}.`);
      return;
    }
    onServingChange(currentServings + 1);
  };

  const startLongPressDecrement = () => {
    intervalRef.current = setInterval(() => {
      const next = servingsRef.current - 1;
      if (next < 1) { clearLongPress(); return; }
      onServingChange(next);
    }, LONG_PRESS_INTERVAL_MS);
  };

  const startLongPressIncrement = () => {
    intervalRef.current = setInterval(() => {
      const next = servingsRef.current + 1;
      if (next > MAX_SERVINGS) { clearLongPress(); return; }
      onServingChange(next);
    }, LONG_PRESS_INTERVAL_MS);
  };

  const isAtMin = currentServings <= 1;
  const isAtMax = currentServings >= MAX_SERVINGS;
  const isDirty = currentServings !== originalServings;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        backgroundColor: c.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c.border,
        overflow: 'hidden',
      }}
    >
      {/* Stepper row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.textSecondary }}>
          Servings
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {/* Decrement */}
          <Pressable
            onPress={handleDecrement}
            onLongPress={startLongPressDecrement}
            onPressOut={clearLongPress}
            disabled={isAtMin}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: isAtMin ? c.border : c.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || isAtMin ? 0.4 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 20,
                lineHeight: 22,
                fontWeight: '400',
                color: isAtMin ? c.textMuted : c.primary,
              }}
            >
              −
            </Text>
          </Pressable>

          {/* Count / spinner */}
          <View style={{ minWidth: 80, alignItems: 'center' }}>
            {isScaling ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Text
                style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}
              >
                {currentServings}{' '}
                <Text style={{ fontSize: 13, fontWeight: '400', color: c.textSecondary }}>
                  {currentServings === 1 ? 'serving' : 'servings'}
                </Text>
              </Text>
            )}
          </View>

          {/* Increment */}
          <Pressable
            onPress={handleIncrement}
            onLongPress={startLongPressIncrement}
            onPressOut={clearLongPress}
            disabled={isAtMax}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: isAtMax ? c.border : c.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || isAtMax ? 0.4 : 1,
            })}
          >
            <Text
              style={{
                fontSize: 20,
                lineHeight: 22,
                fontWeight: '400',
                color: isAtMax ? c.textMuted : c.primary,
              }}
            >
              +
            </Text>
          </Pressable>
        </View>
      </View>

      {/* "Save as default" row — only shown when servings differ from original */}
      {isDirty && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: c.border,
            backgroundColor: c.background,
          }}
        >
          <Text style={{ fontSize: 12, color: c.textMuted }}>
            Original: {originalServings} {originalServings === 1 ? 'serving' : 'servings'}
          </Text>

          <Pressable
            onPress={() => { void onSaveDefault(); }}
            disabled={isSaving}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: pressed || isSaving ? c.primaryLight : c.primary,
              opacity: isSaving ? 0.6 : 1,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>
              {isSaving ? 'Saving…' : 'Save as default'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
