import { Stack } from 'expo-router';
import { View } from 'react-native';
import { ActiveCallBar } from '@/components/ActiveCallBar';
import { IncomingCallBanner } from '@/components/IncomingCallBanner';
import { TabBar } from '@/components/TabBar';

// Senza questa impostazione, entrando da un indirizzo che non è dell'app (es. /terms-update) si apriva la prima schermata dichiarata sotto, cioè la chiamata.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, scrollEdgeEffects: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' } }}>
        <Stack.Screen name="call/[id]" options={{ gestureEnabled: false }} />
      </Stack>
      <TabBar />
      <IncomingCallBanner />
      <ActiveCallBar />
    </View>
  );
}
