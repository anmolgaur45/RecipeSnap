import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRecipeStore } from '@/store/recipeStore';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { Colors, Spacing } from '@/constants/theme';
import { isValidVideoUrl, detectPlatformFromUrl } from '@/utils/formatters';
import { getPlatformLabel } from '@/utils/videoUtils';
import { PlatformIcon } from '@/components/PlatformIcon';
import { SUPPORTED_PLATFORMS } from '@/constants/config';

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string }>();
  const { extractRecipe, isProcessing, processingStatus, error, clearError } = useRecipeStore();

  const [url, setUrl] = useState(params.url ?? '');
  const [detectedPlatform, setDetectedPlatform] = useState<string>('unknown');

  useEffect(() => {
    if (!params.url) return;
    setUrl(params.url);
    if (isValidVideoUrl(params.url) && !isProcessing) {
      extractRecipe(params.url);
    }
  }, [params.url]);

  useEffect(() => {
    const platform = detectPlatformFromUrl(url.trim());
    setDetectedPlatform(platform);
  }, [url]);

  useEffect(() => {
    if (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Extraction Failed', error, [
        { text: 'Try Again', onPress: clearError },
      ]);
    }
  }, [error, clearError]);

  useEffect(() => {
    if (processingStatus.stage === 'complete' && !isProcessing) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const store = useRecipeStore.getState();
      if (store.currentRecipe) {
        router.push(`/recipe/${store.currentRecipe.id}`);
      }
    }
  }, [processingStatus.stage, isProcessing]);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text.trim());
  };

  const handleExtract = async () => {
    const trimmed = url.trim();
    if (!isValidVideoUrl(trimmed)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid URL', 'Please enter a valid Instagram, TikTok, or YouTube link.');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await extractRecipe(trimmed);
  };

  const isValid = isValidVideoUrl(url.trim());

  if (isProcessing) {
    return <ProcessingStatus status={processingStatus} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Gradient hero header */}
      <LinearGradient
        colors={['#FF6B35', '#FF8C5A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingBottom: 28, paddingHorizontal: Spacing.md }}
      >
        <View style={{ paddingTop: insets.top + 8 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 }}>
              Extract a Recipe
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
              Share any cooking video from Instagram, TikTok or YouTube
            </Text>
          </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* URL input card */}
        <View
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.06,
            shadowRadius: 12,
            elevation: 3,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: Colors.background,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 14,
                color: Colors.textPrimary,
              }}
              placeholder="https://www.tiktok.com/@chef/video/..."
              placeholderTextColor={Colors.textMuted}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleExtract}
            />
            <Pressable
              onPress={handlePaste}
              style={{
                backgroundColor: Colors.background,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
              }}
            >
              <Text style={{ fontSize: 14, color: Colors.primary, fontWeight: '600' }}>Paste</Text>
            </Pressable>
          </View>

          {/* Platform indicator */}
          {url.trim().length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isValid ? (
                <>
                  <PlatformIcon platform={detectedPlatform} size={20} />
                  <Text style={{ fontSize: 13, color: Colors.success, fontWeight: '600' }}>
                    {getPlatformLabel(detectedPlatform)} detected
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 13, color: Colors.error }}>
                  Please enter a valid Instagram, TikTok, or YouTube link
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Extract button with gradient */}
        <Pressable onPress={handleExtract} disabled={!isValid} style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 28 }}>
          <LinearGradient
            colors={isValid ? ['#FF6B35', '#E55A24'] : [Colors.border, Colors.border]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: isValid ? '#fff' : Colors.textMuted }}>
              Extract Recipe ✨
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Supported platforms */}
        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
          Supported Platforms
        </Text>
        <View
          style={{
            backgroundColor: Colors.surface,
            borderRadius: 16,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          {SUPPORTED_PLATFORMS.map((p, i) => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 13,
                borderBottomWidth: i < SUPPORTED_PLATFORMS.length - 1 ? 1 : 0,
                borderBottomColor: Colors.border,
              }}
            >
              <PlatformIcon platform={p.id} size={32} />
              <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.textPrimary }}>{p.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
