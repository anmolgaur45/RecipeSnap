import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, BorderRadius, FontSize, Shadow } from '@/constants/theme';
import type { RecipeStep } from '@/store/types';
import StepTimer from './StepTimer';

interface Props {
  step: RecipeStep;
  stepIndex: number;
  totalSteps: number;
  autoRead: boolean;
}

/**
 * True only for steps that involve active cooking, heating, or timed waiting
 * (stove, oven, marinating, resting, etc.). Pure prep/mixing steps return false.
 */
const COOKING_KEYWORDS = /\b(cook|heat|warm|simmer|boil|fry|saut[eé]|sear|brown|caramelize|reduce|render|melt|bake|roast|broil|grill|toast|char|marinate|rest|cool|chill|refrigerate|freeze|soak|steep|steam|poach|blanch|pressure.cook|slow.cook)\b/i;

function requiresTimer(instruction: string): boolean {
  return COOKING_KEYWORDS.test(instruction);
}

/**
 * Parses a human-readable duration string into total seconds.
 * Returns null if the string cannot be parsed (static chip shown as fallback).
 */
function parseDurationToSeconds(duration: string | null): number | null {
  if (!duration) return null;
  const s = duration.trim().toLowerCase();
  const pattern = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m(?!s)|seconds?|secs?|s\b)/g;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(s)) !== null) {
    matched = true;
    const v = parseFloat(match[1]);
    const u = match[2];
    if (/^h/.test(u)) total += v * 3600;
    else if (/^m/.test(u)) total += v * 60;
    else total += v;
  }
  return matched && total > 0 ? Math.round(total) : null;
}

export default function CookModeStep({ step, stepIndex, totalSteps, autoRead }: Props) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const parsedDuration = parseDurationToSeconds(step.duration);

  // Stop speech + trigger auto-read when step changes or autoRead toggle changes
  useEffect(() => {
    void Speech.stop();
    setIsSpeaking(false);

    if (autoRead) {
      setIsSpeaking(true);
      Speech.speak(step.instruction, {
        language: 'en',
        rate: 0.9,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  }, [step.stepNumber, autoRead]);

  // Stop speech on unmount
  useEffect(() => {
    return () => { void Speech.stop(); };
  }, []);

  const handleSpeak = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSpeaking) {
      void Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      Speech.speak(step.instruction, {
        language: 'en',
        rate: 0.9,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.card}>
        {/* Badge row: step counter left, speaker button right */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {'Step ' + (stepIndex + 1) + ' of ' + totalSteps}
            </Text>
          </View>
          <Pressable onPress={handleSpeak} hitSlop={8} style={styles.speakerBtn}>
            <Text style={styles.speakerIcon}>{isSpeaking ? '🔇' : '🔊'}</Text>
          </Pressable>
        </View>

        {/* Instruction */}
        <Text style={styles.instruction}>{step.instruction}</Text>

        {/* Duration: interactive timer only for cooking/heating/waiting steps */}
        {step.duration ? (
          parsedDuration !== null && requiresTimer(step.instruction) ? (
            <StepTimer durationSeconds={parsedDuration} />
          ) : (
            <View style={styles.durationChip}>
              <Text style={styles.durationText}>{'🕐  ' + step.duration}</Text>
            </View>
          )
        ) : null}

        {/* Tip box */}
        {step.tip ? (
          <View style={styles.tipBox}>
            <Text style={styles.tipLabel}>{'💡 Chef\'s tip'}</Text>
            <Text style={styles.tipText}>{step.tip}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  badgeText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  speakerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  speakerIcon: {
    fontSize: 18,
  },
  instruction: {
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    lineHeight: FontSize.xl * 1.55,
    fontWeight: '500',
    marginBottom: Spacing.lg,
  },
  durationChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  durationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tipBox: {
    backgroundColor: '#FFF3ED',
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  tipLabel: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  tipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: FontSize.sm * 1.5,
  },
});
