import { View, Text, Pressable, Linking } from 'react-native';
import { getPlatformIcon, getPlatformLabel } from '@/utils/videoUtils';
import { Platform } from '@/store/types';

interface VideoPreviewProps {
  url: string;
  platform: Platform;
  title?: string;
}

export function VideoPreview({ url, platform, title }: VideoPreviewProps) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      className="bg-surface border border-border rounded-2xl p-4 flex-row items-center gap-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <View className="w-12 h-12 bg-background rounded-xl items-center justify-center">
        <Text className="text-2xl">{getPlatformIcon(platform)}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs text-text-muted font-medium">
          {getPlatformLabel(platform)}
        </Text>
        {title ? (
          <Text className="text-sm text-text-primary font-semibold" numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Text className="text-sm text-text-secondary" numberOfLines={1}>
            {url}
          </Text>
        )}
      </View>
      <Text className="text-text-muted">›</Text>
    </Pressable>
  );
}
