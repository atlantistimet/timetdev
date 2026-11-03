import { Stack } from 'expo-router';
import { View } from 'react-native';
import { ActiveCallBar } from '@/components/ActiveCallBar';
import { IncomingCallBanner } from '@/components/IncomingCallBanner';
import { TabBar } from '@/components/TabBar';

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
