import { Stack } from 'expo-router';
import { View } from 'react-native';
import { IncomingCallBanner } from '@/components/IncomingCallBanner';
import { TabBar } from '@/components/TabBar';

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, scrollEdgeEffects: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' } }} />
      <TabBar />
      <IncomingCallBanner />
    </View>
  );
}
