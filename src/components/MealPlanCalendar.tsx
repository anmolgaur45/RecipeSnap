import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  weekStart: string; // ISO date string (Monday)
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);

  const sm = MONTH_NAMES[start.getMonth()];
  const em = MONTH_NAMES[end.getMonth()];

  if (sm === em) {
    return `${sm} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${sm} ${start.getDate()} – ${em} ${end.getDate()}`;
}

export function MealPlanCalendar({ weekStart, onPrevWeek, onNextWeek, onToday }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  const isCurrentWeek = weekDates.includes(today);

  return (
    <View style={{ paddingHorizontal: Spacing.md, paddingBottom: 12 }}>
      {/* Week range + navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={onPrevWeek}
          style={{ padding: 8, marginRight: 4 }}
          hitSlop={8}
        >
          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>{'‹'}</Text>
        </Pressable>

        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '700',
            color: Colors.textPrimary,
          }}
        >
          {formatWeekRange(weekStart)}
        </Text>

        <Pressable
          onPress={onNextWeek}
          style={{ padding: 8, marginLeft: 4 }}
          hitSlop={8}
        >
          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>{'›'}</Text>
        </Pressable>

        {!isCurrentWeek && (
          <Pressable
            onPress={onToday}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: Colors.primary + '15',
              borderRadius: BorderRadius.full,
              marginLeft: 4,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>
              Today
            </Text>
          </Pressable>
        )}
      </View>

      {/* Day chips */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {weekDates.map((date, i) => {
          const isToday = date === today;
          const dayNum = new Date(date).getDate();

          return (
            <View
              key={date}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 6,
                backgroundColor: isToday ? Colors.primary : 'transparent',
                borderRadius: BorderRadius.sm,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: isToday ? '#fff' : Colors.textMuted,
                  marginBottom: 2,
                }}
              >
                {DAY_LABELS[i]}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isToday ? '#fff' : Colors.textPrimary,
                }}
              >
                {dayNum}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
