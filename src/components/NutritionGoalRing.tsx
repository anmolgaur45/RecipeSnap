import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/theme';

interface Props {
  percentage: number; // 0-100
  color?: string;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}

export function NutritionGoalRing({
  percentage,
  color = Colors.primary,
  size = 72,
  strokeWidth = 6,
  label,
  sublabel,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(Math.max(percentage, 0), 100);
  const dashOffset = circumference * (1 - clampedPct / 100);
  const isOver = percentage > 100;
  const ringColor = isOver ? Colors.error : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center label */}
      {label != null && (
        <View style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontSize: size < 60 ? 11 : 13,
              fontWeight: '700',
              color: isOver ? Colors.error : Colors.textPrimary,
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text style={{ fontSize: 9, color: Colors.textMuted, marginTop: 1 }}>
              {sublabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
