import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TabBar } from '@/components/TabBar';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/notifications';
import { useTheme } from '@/theme';

// Barra in basso dello stile E (capsula nera flottante). Ordine: Esplora, Feed, Agenda, Messaggi, Profilo.
// La creazione (post, offerta, slot personalizzato) sta nel "+" in alto nel Feed.
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const unread = useUnreadCount(session?.user.id ?? null);
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.bg } }}>
      <Tabs.Screen name="services" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="index" options={{ title: t('tabs.feed') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tabs.agenda') }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined }} />
    </Tabs>
  );
}
