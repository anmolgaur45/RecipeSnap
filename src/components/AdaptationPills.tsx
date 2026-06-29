import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/store/themeStore';
import type { AdaptationType } from '@/store/types';

const CUSTOM_EXAMPLES = [
  'Make it spicier',
  'Use Indian ingredients',
  'Under 500 calories',
  'No onion or garlic (Jain)',
  'Reduce sodium',
];

interface AdaptationPillsProps {
  onAdapt: (type: AdaptationType, customPrompt?: string) => void;
  isAdapting: boolean;
}

export function AdaptationPills({
  onAdapt,
  isAdapting,
}: AdaptationPillsProps) {
  const { colors: c } = useTheme();
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const [customText, setCustomText] = useState('');

  const handleButtonPress = () => {
    if (isAdapting) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCustomSheet(true);
  };

  const handleCustomSubmit = () => {
    if (!customText.trim()) return;
    setShowCustomSheet(false);
    onAdapt('custom', customText.trim());
    setCustomText('');
  };

  return (
    <>
      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <Pressable
          onPress={handleButtonPress}
          disabled={isAdapting}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: isAdapting ? c.primary : c.border,
            backgroundColor: isAdapting ? `${c.primary}10` : c.surface,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {isAdapting ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Text style={{ fontSize: 14 }}>✨</Text>
          )}
          <Text style={{ fontSize: 13, fontWeight: '600', color: isAdapting ? c.primary : c.textSecondary }}>
            {isAdapting ? 'Adapting recipe…' : 'Adapt Recipe'}
          </Text>
        </Pressable>
      </View>

      {/* Custom prompt bottom sheet */}
      <Modal
        visible={showCustomSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCustomSheet(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
            onPress={() => setShowCustomSheet(false)}
          >
            <Pressable
              style={{
                backgroundColor: c.surface,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 24,
                paddingBottom: 40,
                gap: 16,
              }}
              onPress={() => {}}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: c.textPrimary }}>
                Custom Adaptation
              </Text>
              <TextInput
                value={customText}
                onChangeText={setCustomText}
                placeholder="Describe what you'd like to change..."
                placeholderTextColor={c.textMuted}
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 14,
                  color: c.textPrimary,
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />

              {/* Example chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {CUSTOM_EXAMPLES.map((ex) => (
                  <Pressable
                    key={ex}
                    onPress={() => setCustomText(ex)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: c.background,
                      borderWidth: 1,
                      borderColor: c.border,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: c.textSecondary }}>{ex}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={handleCustomSubmit}
                disabled={!customText.trim()}
                style={({ pressed }) => ({
                  backgroundColor: c.primary,
                  borderRadius: 14,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: !customText.trim() ? 0.4 : pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                  Adapt Recipe
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setShowCustomSheet(false)}
                style={{ paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 15, color: c.textSecondary, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
