import { useEffect, useRef } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { useRecipeStore } from '@/store/recipeStore';
import { useAuthStore } from '@/store/authStore';
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
  if (isValidVideoUrl(raw)) return raw;
  try {
    const parsed = Linking.parse(raw);
    const urlParam = parsed.queryParams?.url;
    if (typeof urlParam === 'string' && isValidVideoUrl(urlParam)) return urlParam;
  } catch {
    // not a valid Linking URL
  }
  const match = raw.match(/https?:\/\/[^\s]+/);
  if (match && isValidVideoUrl(match[0])) return match[0];
  return null;
}

export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const lastHandledUrl = useRef<string | null>(null);
  const synced = useRef(false);

  // Restore session + listen for auth changes (once).
  useEffect(() => {
    const unsub = useAuthStore.getState().init();
    return unsub;
  }, []);

  // Route gating: bounce between the auth group and the app based on session.
  useEffect(() => {
    if (status === 'loading') return;
    const inAuth = segments[0] === '(auth)';
    if (status === 'signedOut' && !inAuth) router.replace('/(auth)/sign-in');
    else if (status === 'signedIn' && inAuth) router.replace('/(tabs)');
  }, [status, segments]);

  // Hydrate + sync the recipe library once the user is signed in.
  useEffect(() => {
    if (status !== 'signedIn' || synced.current) return;
    synced.current = true;
    useRecipeStore.persist.rehydrate();
    useRecipeStore.getState().syncRecipes();
  }, [status]);

  // Deep links / share intents (only act on them when signed in).
  useEffect(() => {
    function handleUrl(raw: string | null) {
      if (!raw || raw === lastHandledUrl.current) return;
      if (useAuthStore.getState().status !== 'signedIn') return;
      const videoUrl = extractVideoUrl(raw);
      if (videoUrl) {
        lastHandledUrl.current = raw;
        router.push({ pathname: '/(tabs)/add', params: { url: videoUrl } });
      }
    }
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7F4' }}>
        <ActivityIndicator color="#FF6B35" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
        <Stack.Screen name="cook/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="recommendations" options={{ headerShown: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
