import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Colors, Spacing, BorderRadius, FontSize } from '@/constants/theme';

interface StepTimerProps {
  durationSeconds: number; // pre-parsed, always > 0
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function StepTimer({ durationSeconds }: StepTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Reset when durationSeconds prop changes (different step)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSecondsLeft(durationSeconds);
    setStatus('idle');
    flashAnim.setValue(0);
  }, [durationSeconds]);

  // Interval tick — only when running
  useEffect(() => {
    if (status !== 'running') return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  // Detect completion
  useEffect(() => {
    if (secondsLeft === 0 && status === 'running') {
      setStatus('done');
      if (intervalRef.current) clearInterval(intervalRef.current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Speech.speak("Time's up!", { language: 'en', rate: 0.95 });
      // 3-pulse green flash (useNativeDriver: false — backgroundColor can't use native driver)
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start();
    }
  }, [secondsLeft, status]);

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (status === 'idle' || status === 'paused') {
      setStatus('running');
    } else if (status === 'running') {
      setStatus('paused');
    } else {
      // done → reset
      setSecondsLeft(durationSeconds);
      setStatus('idle');
      flashAnim.setValue(0);
    }
  };

  const label = { idle: 'Start', running: 'Pause', paused: 'Resume', done: 'Reset' }[status];

  const timerBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.background, '#D1FAE5'],
  });

  return (
    <Animated.View style={[styles.container, { backgroundColor: timerBg }]}>
      <View style={styles.timeRow}>
        <Text style={styles.emoji}>{'⏱'}</Text>
        <Text style={[styles.time, status === 'done' && styles.timeDone]}>
          {formatTime(secondsLeft)}
        </Text>
        {status === 'done' ? <Text style={styles.checkmark}>{'✓'}</Text> : null}
      </View>
      <Pressable
        style={[
          styles.btn,
          status === 'running' && styles.btnPause,
          status === 'done' && styles.btnDone,
        ]}
        onPress={handlePress}
      >
        <Text style={styles.btnText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  emoji: {
    fontSize: FontSize.lg,
  },
  time: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.textPrimary,
    // Prevents layout shift as digits change
    fontVariant: ['tabular-nums'],
  },
  timeDone: {
    color: Colors.success,
  },
  checkmark: {
    fontSize: FontSize.xl,
    color: Colors.success,
    fontWeight: '700',
  },
  btn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  btnPause: {
    backgroundColor: Colors.textSecondary,
  },
  btnDone: {
    backgroundColor: Colors.success,
  },
  btnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
