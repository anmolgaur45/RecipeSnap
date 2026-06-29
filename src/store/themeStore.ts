import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type ThemeColors } from '@/constants/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Flip between explicit light/dark (used by the header toggle). */
  toggle: () => void;
}

// skipHydration + manual rehydrate (in _layout) mirrors recipeStore — avoids the
// web import.meta hydration issue.
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
    }),
    {
      name: 'recipesnap-theme',
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
    },
  ),
);

/** Active palette resolved from the stored mode + the OS color scheme. */
export function useTheme(): { colors: ThemeColors; isDark: boolean; mode: ThemeMode } {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  return { colors: isDark ? darkColors : lightColors, isDark, mode };
}
