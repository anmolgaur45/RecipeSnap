import Constants from 'expo-constants';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  Constants.expoConfig?.extra?.apiUrl ??
  'http://localhost:3001';

export const SUPPORTED_PLATFORMS = [
  {
    id: 'instagram',
    label: 'Instagram Reels',
    domains: ['instagram.com', 'www.instagram.com'],
    icon: '📸',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    domains: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
    icon: '🎵',
  },
  {
    id: 'youtube',
    label: 'YouTube Shorts',
    domains: ['youtube.com', 'www.youtube.com', 'youtu.be'],
    icon: '▶️',
  },
] as const;

export const EXTRACTION_TIMEOUT_MS = 120_000; // 2 minutes

export const MAX_RECENT_RECIPES = 5;
