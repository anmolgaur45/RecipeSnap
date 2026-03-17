/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B35',
        'primary-light': '#FF8C5A',
        'primary-dark': '#E55A24',
        surface: '#FFFFFF',
        background: '#F8F7F4',
        'text-primary': '#1A1A1A',
        'text-secondary': '#6B7280',
        'text-muted': '#9CA3AF',
        border: '#E5E7EB',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
