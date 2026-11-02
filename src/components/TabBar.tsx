import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TabKey = 'services' | 'index' | 'bookings' | 'messages' | 'profile';

const TABS: { key: TabKey; href: Href; icon: IconName; label: string }[] = [
  { key: 'services', href: '/services', icon: 'compass-outline', label: 'tabs.explore' },
  { key: 'index', href: '/', icon: 'home-outline', label: 'tabs.feed' },
  { key: 'bookings', href: '/bookings', icon: 'calendar-outline', label: 'tabs.agenda' },
  { key: 'messages', href: '/messages', icon: 'chatbubble-outline', label: 'tabs.messages' },
  { key: 'profile', href: '/profile', icon: 'person-outline', label: 'tabs.profile' },
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
  if (HIDDEN.some((re) => re.test(pathname))) return null;
  const active = here ?? lastTab;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 16) }]}>
      <View style={[styles.bar, { backgroundColor: theme.ink }]}>
        {TABS.map((tab) => {
          const focused = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={t(tab.label)}
              accessibilityState={{ selected: focused }}
              onPress={() => router.navigate(tab.href)}
              style={[styles.item, focused && { backgroundColor: theme.accent }]}>
              <Ionicons name={tab.icon} size={24} color={focused ? theme.onAccent : theme.inkMuted} />
              {tab.key === 'profile' && unread > 0 ? <View style={[styles.badge, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
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
