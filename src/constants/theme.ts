// Reelish theme — green accent, warm neutrals, serif headlines (Newsreader) +
// Hanken Grotesk body. Light + dark palettes share one shape so `useTheme()`
// (see store/themeStore) can swap them at runtime. Files not yet migrated import
// `Colors` (the light palette) and keep working until re-skinned.

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  surface: string;
  /** Subtle filled surface: search bars, chips, inset rows. */
  surfaceAlt: string;
  background: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  error: string;
}

export const lightColors: ThemeColors = {
  primary: '#1FAA6B',
  primaryLight: '#34C98A',
  primaryDark: '#178A57',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F5F4',
  background: '#FBFAF8',
  textPrimary: '#1C1B18',
  textSecondary: '#8A8A8A',
  textMuted: '#B0B0B0',
  border: '#ECECEC',
  success: '#1FAA6B',
  warning: '#F59E0B',
  error: '#EF4444',
};

export const darkColors: ThemeColors = {
  primary: '#34C98A',
  primaryLight: '#5BD6A3',
  primaryDark: '#1FAA6B',
  surface: '#1A1A1C',
  surfaceAlt: '#232326',
  background: '#0F0F10',
  textPrimary: '#F3F1ED',
  textSecondary: '#9A9A9A',
  textMuted: '#6A6A6A',
  border: '#2C2C2E',
  success: '#34C98A',
  warning: '#FBBF24',
  error: '#F87171',
};

// Back-compat alias for files not yet migrated to useTheme(). Equals the light
// palette, so unmigrated screens render light (correct) until re-skinned.
export const Colors = lightColors;

// Loaded font family names (see _layout.tsx useFonts). Newsreader = serif
// headlines, Hanken Grotesk = body/UI.
export const Fonts = {
  serif: 'Newsreader_600SemiBold',
  serifMedium: 'Newsreader_500Medium',
  serifRegular: 'Newsreader_400Regular',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
  bodyExtrabold: 'HankenGrotesk_800ExtraBold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
