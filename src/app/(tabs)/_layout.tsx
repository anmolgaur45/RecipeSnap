import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/store/themeStore';
import { Fonts } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  const icon = (focused: boolean, active: IoniconName, inactive: IoniconName) => (
    <Ionicons
      name={focused ? active : inactive}
      size={23}
      color={focused ? colors.primary : colors.textMuted}
    />
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 6,
          height: 62,
        },
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontFamily: Fonts.bodySemibold,
          marginTop: 1,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => icon(focused, 'home', 'home-outline') }}
      />
      <Tabs.Screen
        name="plan"
        options={{ title: 'Plan', tabBarIcon: ({ focused }) => icon(focused, 'calendar', 'calendar-outline') }}
      />
      {/* Center action button — add a recipe (green rounded square, elevated) */}
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarItemStyle: { paddingBottom: 0 },
          tabBarIcon: () => (
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 19,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isDark ? 0.5 : 0.4,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              <Ionicons name="add" size={30} color="#fff" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{ title: 'Grocery', tabBarIcon: ({ focused }) => icon(focused, 'cart', 'cart-outline') }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Library', tabBarIcon: ({ focused }) => icon(focused, 'bookmarks', 'bookmarks-outline') }}
      />
    </Tabs>
  );
}
