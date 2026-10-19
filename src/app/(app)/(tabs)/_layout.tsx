import type { ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Barra in basso flottante, come nel prototipo: pillola chiara, voce attiva evidenziata.
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const icon = (name: IconName, nameOn: IconName) =>
    function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
      return <Ionicons name={focused ? nameOn : name} size={22} color={color} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { borderRadius: 999, marginVertical: 5 },
        tabBarActiveBackgroundColor: theme.glassOn,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 14,
          height: 64,
          borderRadius: 999,
          borderTopWidth: 0,
          backgroundColor: theme.glass,
          paddingHorizontal: 5,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
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
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
