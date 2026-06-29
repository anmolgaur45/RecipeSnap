/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Reelish light palette (mirrors src/constants/theme.ts lightColors).
        primary: '#1FAA6B',
        'primary-light': '#34C98A',
        'primary-dark': '#178A57',
        surface: '#FFFFFF',
        'surface-alt': '#F4F5F4',
        background: '#FBFAF8',
        'text-primary': '#1C1B18',
        'text-secondary': '#8A8A8A',
        'text-muted': '#B0B0B0',
        border: '#ECECEC',
        success: '#1FAA6B',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['HankenGrotesk_400Regular'],
        serif: ['Newsreader_600SemiBold'],
      },
    },
  },
  plugins: [],
};
