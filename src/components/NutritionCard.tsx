import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { Fonts, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';
import { calculateNutritionApi } from '@/services/api';
import type { NutritionInfo, Recipe } from '@/store/types';

// FDA reference daily values (2 000 kcal diet)
const DV = { calories: 2000, protein: 50, carbs: 275, fat: 78, fiber: 28, sodium: 2300 };

const MACRO_COLORS = {
  protein: '#4F8EF7',
  carbs: '#F5A623',
  fat: '#A855F7',
};

// ── Shimmer ───────────────────────────────────────────────────────────────────
function Shimmer({ width, height, radius = 8 }: { width: number | string; height: number; radius?: number }) {
  const { colors: c } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Animated.View style={{ width: width as any, height, borderRadius: radius, backgroundColor: c.surfaceAlt, opacity }} />;
}

// ── Stacked macro bar ─────────────────────────────────────────────────────────
function MacroBar({ proteinPct, carbsPct, fatPct }: { proteinPct: number; carbsPct: number; fatPct: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', backgroundColor: c.surfaceAlt }}>
      <View style={{ flex: Math.max(proteinPct, 0.5), backgroundColor: MACRO_COLORS.protein }} />
      <View style={{ width: 1, backgroundColor: c.surface }} />
      <View style={{ flex: Math.max(carbsPct, 0.5), backgroundColor: MACRO_COLORS.carbs }} />
      <View style={{ width: 1, backgroundColor: c.surface }} />
      <View style={{ flex: Math.max(fatPct, 0.5), backgroundColor: MACRO_COLORS.fat }} />
    </View>
  );
}

// ── Macro legend chip ─────────────────────────────────────────────────────────
function MacroLegend({ color, label, grams, pct }: { color: string; label: string; grams: number; pct: number }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
        <Text style={{ fontSize: 11, fontFamily: Fonts.bodySemibold, color: c.textMuted }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 15, fontFamily: Fonts.bodyExtrabold, color: c.textPrimary }}>{grams}g</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, fontFamily: Fonts.body }}>{pct}% cal</Text>
    </View>
  );
}

// ── Nutrient table row ────────────────────────────────────────────────────────
function NutrientRow({
  label, value, dv, bold, indent, last,
}: { label: string; value: string; dv: string; bold?: boolean; indent?: boolean; last?: boolean }) {
  const { colors: c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 13,
          color: c.textPrimary,
          fontFamily: bold ? Fonts.bodyBold : Fonts.body,
          paddingLeft: indent ? 14 : 0,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 13, fontFamily: Fonts.bodySemibold, color: c.textPrimary, minWidth: 58, textAlign: 'right' }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 42, textAlign: 'right', fontFamily: Fonts.body }}>
        {dv}
      </Text>
    </View>
  );
}

const makeCardBase = (c: ThemeColors) => ({
  marginHorizontal: 16,
  marginBottom: 20,
  padding: 18,
  backgroundColor: c.surface,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: c.border,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const);

// ── Main ──────────────────────────────────────────────────────────────────────
interface NutritionCardProps {
  recipe: Recipe;
  currentServings: number;
  onRecipeUpdate: (updated: Recipe) => void;
}

export function NutritionCard({ recipe, currentServings, onRecipeUpdate }: NutritionCardProps) {
  const { colors: c } = useTheme();
  const cardBase = makeCardBase(c);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const nutrition: NutritionInfo | undefined = recipe.nutrition;

  useEffect(() => {
    if (!recipe.nutrition) {
      setIsCalculating(true);
      setHasError(false);
      calculateNutritionApi(recipe.id)
        .then((updated) => { onRecipeUpdate(updated); setIsCalculating(false); })
        .catch(() => { setIsCalculating(false); setHasError(true); });
    }
  }, [recipe.id, retryCount]);

  const toggleExpand = () => {
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);
    Animated.spring(expandAnim, { toValue, useNativeDriver: false, tension: 80, friction: 10 }).start();
  };

  if (isCalculating) {
    return (
      <View style={cardBase}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Shimmer width={90} height={12} />
          <Shimmer width={60} height={12} />
        </View>
        <Shimmer width="40%" height={34} radius={6} />
        <View style={{ marginTop: 14 }}>
          <Shimmer width="100%" height={10} radius={5} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Shimmer width="30%" height={48} />
          <Shimmer width="30%" height={48} />
          <Shimmer width="30%" height={48} />
        </View>
        <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 12, textAlign: 'center', fontFamily: Fonts.body }}>
          Estimating nutrition with AI…
        </Text>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[cardBase, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontFamily: Fonts.bodyBold, color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>
            Nutrition
          </Text>
          <Text style={{ fontSize: 13, color: c.textMuted, fontFamily: Fonts.body }}>Data unavailable</Text>
        </View>
        <Pressable
          onPress={() => setRetryCount((n) => n + 1)}
          style={({ pressed }) => ({
            backgroundColor: c.primary + '15',
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontFamily: Fonts.bodyBold, color: c.primary }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!nutrition) return null;

  const proteinCal = nutrition.proteinGrams * 4;
  const carbsCal   = nutrition.carbsGrams * 4;
  const fatCal     = nutrition.fatGrams * 9;
  const totalMacroCal = proteinCal + carbsCal + fatCal;

  const proteinPct = Math.round((proteinCal / totalMacroCal) * 100);
  const carbsPct   = Math.round((carbsCal   / totalMacroCal) * 100);
  const fatPct     = Math.round((fatCal     / totalMacroCal) * 100);

  const dvPct = (val: number, dv: number) => `${Math.round((val / dv) * 100)}%`;

  const isLowConf = nutrition.confidence === 'low';

  return (
    <View style={cardBase}>
      <Pressable onPress={toggleExpand} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <View>
            <Text style={{ fontSize: 10, fontFamily: Fonts.bodyExtrabold, color: c.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Nutrition
            </Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 1, fontFamily: Fonts.body }}>
              Per serving · serves {currentServings}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isLowConf && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontFamily: Fonts.bodyBold, color: '#D97706' }}>⚠ Low confidence</Text>
              </View>
            )}
            <Text style={{ fontSize: 13, color: c.textMuted }}>
              {isExpanded ? '▲' : '▼'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginBottom: 14 }}>
          <Text style={{ fontSize: 38, fontFamily: Fonts.bodyExtrabold, color: c.textPrimary, letterSpacing: -1 }}>
            {nutrition.caloriesPerServing}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: Fonts.bodySemibold, color: c.textMuted, paddingBottom: 4 }}>kcal</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, paddingBottom: 3, marginLeft: 2, fontFamily: Fonts.body }}>
            · {dvPct(nutrition.caloriesPerServing, DV.calories)} daily value
          </Text>
        </View>

        <MacroBar proteinPct={proteinPct} carbsPct={carbsPct} fatPct={fatPct} />

        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <MacroLegend color={MACRO_COLORS.protein} label="Protein" grams={nutrition.proteinGrams} pct={proteinPct} />
          <View style={{ width: 1, backgroundColor: c.border, marginVertical: 4 }} />
          <MacroLegend color={MACRO_COLORS.carbs} label="Carbs" grams={nutrition.carbsGrams} pct={carbsPct} />
          <View style={{ width: 1, backgroundColor: c.border, marginVertical: 4 }} />
          <MacroLegend color={MACRO_COLORS.fat} label="Fat" grams={nutrition.fatGrams} pct={fatPct} />
        </View>
      </Pressable>

      {isExpanded && (
        <View style={{ marginTop: 20 }}>
          <View style={{ height: 1, backgroundColor: c.border, marginBottom: 16 }} />

          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: c.surfaceAlt }}>
              <Text style={{ flex: 1, fontSize: 10, fontFamily: Fonts.bodyExtrabold, color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
                Nutrient
              </Text>
              <Text style={{ fontSize: 10, fontFamily: Fonts.bodyExtrabold, color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', minWidth: 58, textAlign: 'right' }}>
                Amount
              </Text>
              <Text style={{ fontSize: 10, fontFamily: Fonts.bodyExtrabold, color: c.textMuted, letterSpacing: 1, textTransform: 'uppercase', minWidth: 42, textAlign: 'right' }}>
                % DV
              </Text>
            </View>

            <View style={{ height: 2, backgroundColor: c.textPrimary }} />

            <NutrientRow bold label="Calories" value={`${nutrition.caloriesPerServing}`} dv={dvPct(nutrition.caloriesPerServing, DV.calories)} />
            <View style={{ height: 1, backgroundColor: c.textPrimary, marginHorizontal: 14 }} />
            <NutrientRow bold label="Total Fat" value={`${nutrition.fatGrams}g`} dv={dvPct(nutrition.fatGrams, DV.fat)} />
            <NutrientRow bold label="Total Carbohydrate" value={`${nutrition.carbsGrams}g`} dv={dvPct(nutrition.carbsGrams, DV.carbs)} />
            <NutrientRow indent label="Dietary Fiber" value={`${nutrition.fiberGrams}g`} dv={dvPct(nutrition.fiberGrams, DV.fiber)} />
            <NutrientRow indent label="Total Sugars" value={`${nutrition.sugarGrams}g`} dv="—" />
            <View style={{ height: 1, backgroundColor: c.textPrimary, marginHorizontal: 14 }} />
            <NutrientRow bold label="Protein" value={`${nutrition.proteinGrams}g`} dv={dvPct(nutrition.proteinGrams, DV.protein)} />
            <View style={{ height: 1, backgroundColor: c.textPrimary, marginHorizontal: 14 }} />
            <NutrientRow label="Sodium" last value={`${nutrition.sodiumMg}mg`} dv={dvPct(nutrition.sodiumMg, DV.sodium)} />
          </View>

          <Text style={{ fontSize: 10, color: c.textMuted, marginTop: 10, lineHeight: 15, fontFamily: Fonts.body }}>
            * % Daily Values based on a 2,000 calorie diet. Values are AI-estimated — actual nutrition may vary based on specific brands and preparation.
          </Text>
        </View>
      )}
    </View>
  );
}
