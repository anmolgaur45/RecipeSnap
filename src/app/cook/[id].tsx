import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useRecipeStore } from '@/store/recipeStore';
import { useCookStore } from '@/store/cookStore';
import CookModeStep from '@/components/CookModeStep';
import { Spacing, BorderRadius, FontSize, Shadow, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';

export default function CookScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const recipe = useRecipeStore((s) => s.recipes.find((r) => r.id === id));

  const {
    currentStepIndex,
    totalSteps,
    isActive,
    startSession,
    nextStep,
    prevStep,
    completeSession,
    reset,
  } = useCookStore();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [isStarting, setIsStarting] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Rating sheet animation
  const sheetAnim = useRef(new Animated.Value(500)).current;

  const openRatingSheet = useCallback(() => {
    setShowRating(true);
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 22,
      stiffness: 280,
    }).start();
  }, [sheetAnim]);

  // Start session on mount
  useEffect(() => {
    if (!recipe || isActive) return;
    setIsStarting(true);
    startSession(recipe.id, recipe.originalServings ?? 2, recipe.steps.length)
      .catch((e: Error) => {
        Alert.alert('Could not start cook session', e.message);
        router.back();
      })
      .finally(() => setIsStarting(false));
  }, [recipe?.id]);

  const handleClose = useCallback(() => {
    if (!isActive) { router.back(); return; }
    Alert.alert(
      'Exit Cook Mode?',
      'Your progress will not be saved.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => { reset(); router.back(); },
        },
      ],
    );
  }, [isActive, reset]);

  const handleDoneCooking = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    openRatingSheet();
  }, [openRatingSheet]);

  const handleSaveAndFinish = useCallback(async () => {
    if (selectedRating === 0) {
      Alert.alert('Please select a rating', 'Tap a star to rate this recipe.');
      return;
    }
    setIsSaving(true);
    try {
      await completeSession(selectedRating, notes.trim() || undefined);
      router.replace(`/recipe/${id}`);
    } catch (e) {
      Alert.alert('Could not save session', (e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [selectedRating, notes, id, completeSession]);

  if (!recipe) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Recipe not found.</Text>
      </View>
    );
  }

  if (isStarting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.loadingText}>Starting cook session…</Text>
      </View>
    );
  }

  const currentStep = recipe.steps[currentStepIndex];
  const isLastStep = currentStepIndex === totalSteps - 1;
  const progress = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={8}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
        <Text style={styles.recipeTitle} numberOfLines={1}>{recipe.title}</Text>
        <Pressable
          onPress={() => {
            setAutoRead((v) => !v);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.closeBtn, styles.autoReadBtn, autoRead && styles.autoReadBtnActive]}
          hitSlop={8}
        >
          <Text style={styles.autoReadIcon}>{'🔊'}</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Step card */}
      {currentStep ? (
        <CookModeStep
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={totalSteps}
          autoRead={autoRead}
        />
      ) : null}

      {/* Nav row */}
      <View style={[styles.navRow, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.navBtn, styles.navBtnSecondary, currentStepIndex === 0 && styles.navBtnDisabled]}
          disabled={currentStepIndex === 0}
          onPress={prevStep}
        >
          <Text style={[styles.navBtnSecondaryText, currentStepIndex === 0 && styles.navBtnDisabledText]}>
            ← Prev
          </Text>
        </Pressable>

        {isLastStep ? (
          <Pressable style={[styles.navBtn, styles.navBtnDone]} onPress={handleDoneCooking}>
            <Text style={styles.navBtnPrimaryText}>Done Cooking ✓</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.navBtn, styles.navBtnPrimary]} onPress={nextStep}>
            <Text style={styles.navBtnPrimaryText}>Next →</Text>
          </Pressable>
        )}
      </View>

      {/* Rating overlay — inline, NOT Modal */}
      {showRating && (
        <View style={StyleSheet.absoluteFillObject}>
          {/* Non-dismissable backdrop */}
          <View style={styles.backdrop} />

          <Animated.View style={[styles.ratingSheet, { transform: [{ translateY: sheetAnim }], paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={styles.handle} />

            <Text style={styles.ratingHeading}>How did it go?</Text>
            <Text style={styles.ratingSubheading}>{recipe.title}</Text>

            {/* Stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  hitSlop={8}
                >
                  <Text style={[styles.star, selectedRating >= star && styles.starFilled]}>
                    {selectedRating >= star ? '★' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Optional notes */}
            <TextInput
              style={styles.notesInput}
              placeholder="Any notes? (optional)"
              placeholderTextColor={c.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={300}
            />

            {/* Save button */}
            <Pressable
              style={[styles.saveBtn, (isSaving || selectedRating === 0) && styles.saveBtnDisabled]}
              onPress={handleSaveAndFinish}
              disabled={isSaving || selectedRating === 0}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveBtnText}>Save & Finish</Text>
              }
            </Pressable>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  errorText: {
    fontSize: FontSize.md,
    color: c.textSecondary,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: c.textMuted,
    marginTop: Spacing.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: FontSize.lg,
    color: c.textSecondary,
    fontWeight: '600',
  },
  recipeTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: c.textPrimary,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },

  // Progress
  progressTrack: {
    height: 4,
    backgroundColor: c.border,
  },
  progressFill: {
    height: 4,
    backgroundColor: c.primary,
  },

  // Nav row
  navRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnPrimary: {
    backgroundColor: c.primary,
  },
  navBtnDone: {
    backgroundColor: c.success,
  },
  navBtnSecondary: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnPrimaryText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  navBtnSecondaryText: {
    color: c.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  navBtnDisabledText: {
    color: c.textMuted,
  },

  // Rating overlay
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ratingSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    ...Shadow.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: c.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
    marginTop: Spacing.xs,
  },
  ratingHeading: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: c.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  ratingSubheading: {
    fontSize: FontSize.sm,
    color: c.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  star: {
    fontSize: 40,
    color: c.border,
  },
  starFilled: {
    color: c.warning,
  },
  notesInput: {
    backgroundColor: c.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    color: c.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  saveBtn: {
    backgroundColor: c.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  // Auto-read toggle
  autoReadBtn: {
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  autoReadBtnActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  autoReadIcon: {
    fontSize: FontSize.md,
  },
});
