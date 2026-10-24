import { Stack } from 'expo-router';
import { View } from 'react-native';
import { IncomingCallBanner } from '@/components/IncomingCallBanner';

export default function AppLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <IncomingCallBanner />
    </View>
  );
}
