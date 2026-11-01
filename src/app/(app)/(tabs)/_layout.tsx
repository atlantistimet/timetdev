import { View, type ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import { fonts, useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Barra in basso del tema C: fissa (non copre più la fine delle pagine), bianca con bordo sottile,
// voce attiva con una pillola lime dietro l'icona.
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const unread = useUnreadCount(session?.user.id ?? null);
  const icon = (name: IconName, nameOn: IconName) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return (
        <View
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? theme.accent : 'transparent',
          }}>
          <Ionicons name={focused ? nameOn : name} size={22} color={focused ? theme.onAccent : color} />
        </View>
      );
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontFamily: fonts.medium },
        tabBarStyle: {
          backgroundColor: theme.glass,
          borderTopWidth: 1,
          borderTopColor: theme.line,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        sceneStyle: { backgroundColor: theme.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="services" options={{ title: t('tabs.explore'), tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen
        name="new"
        options={{ title: t('tabs.new'), tabBarIcon: icon('add-circle-outline', 'add-circle') }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            router.push('/new-post');
          },
        }}
      />
      <Tabs.Screen name="bookings" options={{ title: t('tabs.agenda'), tabBarIcon: icon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person'), tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined, tabBarBadgeStyle: { backgroundColor: theme.primary, color: theme.onPrimary, fontFamily: fonts.semibold } }} />
    </Tabs>
  );
}
