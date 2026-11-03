import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import Svg, { Path } from 'react-native-svg';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { barCompact, resetBar } from '@/lib/chrome';
import { useTheme } from '@/theme';

type TabKey = 'services' | 'index' | 'bookings' | 'messages' | 'profile';

// Icone dei mockup stile E (24×24, contorno 2)
const ICONS: Record<TabKey, string> = {
  services: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  index: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  bookings: 'M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM8 3v4M16 3v4M3.5 10h17',
  messages: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z',
  profile: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
};

const TABS: { key: TabKey; href: Href; label: string }[] = [
  { key: 'index', href: '/', label: 'tabs.feed' },
  { key: 'services', href: '/services', label: 'tabs.explore' },
  { key: 'bookings', href: '/bookings', label: 'tabs.agenda' },
  { key: 'messages', href: '/messages', label: 'tabs.messages' },
  { key: 'profile', href: '/profile', label: 'tabs.profile' },
];

const ROOTS: Record<string, TabKey> = { '/': 'index', '/services': 'services', '/bookings': 'bookings', '/messages': 'messages', '/profile': 'profile' };

/** Schermate in cui la barra sta nascosta: dentro le chat e durante la chiamata. */
const HIDDEN = [/^\/chat\//, /^\/call\//];

/**
 * Barra in basso dello stile E: capsula nera flottante 306×66, voce attiva in un cerchio lime da 54.
 * Sta sopra tutte le schermate dell'app; nelle schermate interne resta accesa la voce da cui si è arrivati.
 */
export function TabBar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { session } = useAuth();
  const unread = useUnreadCount(session?.user.id ?? null);
  const [lastTab, setLastTab] = useState<TabKey>('index');
  const here = ROOTS[pathname];
  if (here && here !== lastTab) setLastTab(here);
  const active = here ?? lastTab;
  const index = TABS.findIndex((x) => x.key === active);
  const slot = useSharedValue(index);
  const circle = useAnimatedStyle(() => ({ transform: [{ translateX: slot.get() * 60 }] }));
  useEffect(() => {
    slot.set(withTiming(index, { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  }, [index, slot]);
  const shrink = useAnimatedStyle(() => {
    const c = barCompact.get();
    const k = interpolate(c, [0, 1], [1, 0.9]);
    return { transform: [{ translateY: interpolate(c, [0, 1], [0, 4]) }, { scale: k }] };
  });
  useEffect(() => {
    resetBar();
  }, [pathname]);
  if (HIDDEN.some((re) => re.test(pathname))) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 16) }]}>
      <Animated.View style={[styles.bar, { backgroundColor: theme.ink }, shrink]}>
        <Animated.View pointerEvents="none" style={[styles.circle, { backgroundColor: theme.accent }, circle]} />
        {TABS.map((tab) => {
          const focused = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              haptic="select"
              scaleTo={0.9}
              accessibilityLabel={t(tab.label)}
              accessibilityState={{ selected: focused }}
              onPress={() => router.navigate(tab.href)}
              style={styles.item}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={focused ? theme.onAccent : theme.inkMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d={ICONS[tab.key]} />
              </Svg>
              {tab.key === 'profile' && unread > 0 ? <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
            </Pressable>
          );
        })}
      </Animated.View>
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
  circle: { position: 'absolute', left: 6, top: 6, width: 54, height: 54, borderRadius: 999 },
  item: { width: 54, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 12, right: 12, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});
