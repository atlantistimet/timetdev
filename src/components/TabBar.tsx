import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, IconName> = {
  services: 'compass-outline',
  index: 'home-outline',
  bookings: 'calendar-outline',
  messages: 'chatbubble-outline',
  profile: 'person-outline',
};

/** Barra in basso dello stile E: capsula nera flottante 306×66, voce attiva in un cerchio lime da 54. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 16) }]}>
      <View style={[styles.bar, { backgroundColor: theme.ink }]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          const badge = options.tabBarBadge;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={[styles.item, focused && { backgroundColor: theme.accent }]}>
              <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={24} color={focused ? theme.onAccent : theme.inkMuted} />
              {badge ? <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    width: 306,
    height: 66,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    shadowColor: '#151515',
    shadowOpacity: 0.18,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  item: { width: 54, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
