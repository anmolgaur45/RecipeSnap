import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { useRecipeStore } from '@/store/recipeStore';
import { isValidVideoUrl } from '@/utils/formatters';
import '../global.css';

/**
 * Extracts a video URL from any incoming link shape:
 *   - Direct video URL (VIEW intent):  https://www.tiktok.com/@x/video/...
 *   - Custom scheme (URL scheme):       recipesnap://add?url=https%3A%2F%2F...
 *   - SEND intent shared text:          the raw text may just be the URL
 */
function extractVideoUrl(raw: string): string | null {
  if (!raw) return null;

  // Direct video URL
  if (isValidVideoUrl(raw)) return raw;

  // Custom scheme: recipesnap://add?url=<encoded-url>
  try {
    const parsed = Linking.parse(raw);
    const urlParam = parsed.queryParams?.url;
    if (typeof urlParam === 'string' && isValidVideoUrl(urlParam)) return urlParam;
  } catch {
    // not a valid Linking URL
  }

  // SEND intent may pass raw text — extract any URL-like substring
  const match = raw.match(/https?:\/\/[^\s]+/);
  if (match && isValidVideoUrl(match[0])) return match[0];

  return null;
}

function navigateToAdd(videoUrl: string) {
  router.push({ pathname: '/(tabs)/add', params: { url: videoUrl } });
}

export default function RootLayout() {
  // Guard against handling the same URL twice (e.g. app resumes from background)
  const lastHandledUrl = useRef<string | null>(null);

  function handleUrl(raw: string | null) {
    if (!raw || raw === lastHandledUrl.current) return;
    const videoUrl = extractVideoUrl(raw);
    if (videoUrl) {
      lastHandledUrl.current = raw;
      navigateToAdd(videoUrl);
    }
  }

  useEffect(() => {
    useRecipeStore.persist.rehydrate();
    useRecipeStore.getState().syncRecipes();

    // URL that launched the app cold (VIEW / SEND intent, or custom scheme tap)
    Linking.getInitialURL().then(handleUrl);

    // URL received while app is already running (e.g. share sheet while foregrounded)
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="recipe/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerTintColor: '#FF6B35',
          }}
        />
        <Stack.Screen name="recommendations" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
