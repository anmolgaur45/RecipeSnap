import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRef, useMemo } from 'react';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/store/themeStore';
import type { PantryItem } from '@/store/types';

interface Props {
  item: PantryItem;
  onDelete: () => void;
  onEdit: () => void;
}

export function PantryItemRow({ item, onDelete, onEdit }: Props) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const EXPIRY_COLORS: Record<string, string> = { fresh: c.success, expiring_soon: c.warning, expired: c.error };
  const swipeRef = useRef<Swipeable>(null);

  const handleDelete = () => {
    if (item.isStaple) {
      Alert.alert(
        'Delete Staple?',
        `"${item.displayName ?? item.item}" is a staple. Are you sure you want to remove it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => { swipeRef.current?.close(); onDelete(); },
          },
        ]
      );
    } else {
      swipeRef.current?.close();
      onDelete();
    }
  };

  const renderRightActions = () => (
    <Pressable onPress={handleDelete} style={styles.deleteAction}>
      <Text style={styles.deleteText}>🗑</Text>
    </Pressable>
  );

  const quantityText = [item.quantity, item.unit].filter(Boolean).join(' ');
  const expiryColor = EXPIRY_COLORS[item.expiryStatus] ?? c.success;

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEdit(); }}
        style={styles.row}
      >
        {/* Expiry dot */}
        <View style={[styles.expiryDot, { backgroundColor: expiryColor }]} />

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.displayName ?? item.item}
            </Text>
            {!!item.isStaple && (
              <View style={styles.stapleBadge}>
                <Text style={styles.stapleBadgeText}>staple</Text>
              </View>
            )}
          </View>
          <View style={styles.bottomRow}>
            {quantityText ? <Text style={styles.quantity}>{quantityText}</Text> : null}
            {item.expiresAt ? (
              <Text style={[styles.expiry, { color: expiryColor }]}>
                {item.expiryStatus === 'expired'
                  ? 'Expired'
                  : `Expires ${formatDate(item.expiresAt)}`}
              </Text>
            ) : null}
            {item.notes ? <Text style={styles.notes} numberOfLines={1}>{item.notes}</Text> : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    gap: 12,
  },
  expiryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: c.textPrimary,
  },
  stapleBadge: {
    backgroundColor: `${c.primary}18`,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stapleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: c.primary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantity: {
    fontSize: 13,
    color: c.textSecondary,
  },
  expiry: {
    fontSize: 12,
    fontWeight: '500',
  },
  notes: {
    fontSize: 12,
    color: c.textMuted,
    fontStyle: 'italic',
  },
  deleteAction: {
    backgroundColor: c.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
  },
  deleteText: {
    fontSize: 20,
  },
});
