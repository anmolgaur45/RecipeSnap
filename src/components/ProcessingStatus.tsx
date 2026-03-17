import { View, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ProcessingStatus as ProcessingStatusType } from '@/store/types';
import { Colors } from '@/constants/theme';

interface ProcessingStatusProps {
  status: ProcessingStatusType;
}

const MESSAGES = [
  'Watching the video...',
  'Spotting the ingredients...',
  'Jotting down the steps...',
  'Tasting for accuracy...',
  'Plating your recipe...',
  'Almost ready to serve...',
];

const EMOJIS = ['🍳', '🥘', '👨‍🍳', '🥗', '✨'];

export function ProcessingStatus({ status: _ }: ProcessingStatusProps) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [emojiIndex, setEmojiIndex] = useState(0);

  const floatY = useRef(new Animated.Value(0)).current;
  const fadeMsg = useRef(new Animated.Value(1)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  // Float the emoji up and down
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -14, duration: 1100, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // Cycle messages + emoji with fade
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fadeMsg, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setMsgIndex((i) => (i + 1) % MESSAGES.length);
        setEmojiIndex((i) => (i + 1) % EMOJIS.length);
        Animated.timing(fadeMsg, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }, 3200);
    return () => clearInterval(id);
  }, []);

  // Sequential dot pulse
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dot1, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(dot1, { toValue: 0.3, duration: 280, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(dot2, { toValue: 0.3, duration: 280, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(dot3, { toValue: 0.3, duration: 280, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <LinearGradient colors={['#FFF8F5', '#F8F7F4']} style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>

        {/* Floating emoji bubble */}
        <Animated.View style={{ transform: [{ translateY: floatY }], marginBottom: 36 }}>
          <View
            style={{
              width: 108,
              height: 108,
              borderRadius: 54,
              backgroundColor: `${Colors.primary}14`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.Text style={{ fontSize: 50, opacity: fadeMsg }}>
              {EMOJIS[emojiIndex]}
            </Animated.Text>
          </View>
        </Animated.View>

        {/* Heading */}
        <Text
          style={{
            fontSize: 26,
            fontWeight: '800',
            color: Colors.textPrimary,
            textAlign: 'center',
            letterSpacing: -0.5,
            lineHeight: 32,
            marginBottom: 12,
          }}
        >
          Cooking up{'\n'}your recipe
        </Text>

        {/* Cycling subtitle */}
        <Animated.Text
          style={{
            opacity: fadeMsg,
            fontSize: 15,
            color: Colors.textSecondary,
            textAlign: 'center',
            marginBottom: 44,
          }}
        >
          {MESSAGES[msgIndex]}
        </Animated.Text>

        {/* Animated dots */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 44 }}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: Colors.primary,
                opacity: dot,
              }}
            />
          ))}
        </View>

        <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center' }}>
          This usually takes 20–60 seconds
        </Text>
      </View>
    </LinearGradient>
  );
}
