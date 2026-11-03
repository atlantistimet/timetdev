import '@/i18n';
import { useEffect } from 'react';
import {
  InterTight_300Light,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter-tight';
import { Stack, router, usePathname, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { Body, Button, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { takePendingPath } from '@/lib/pending-link';

// Lo splash resta visibile finché non sappiamo se c'è una sessione: niente lampi di schermate sbagliate.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { t } = useTranslation();
  const { session, isLoading, profileError, isAdultConfirmed, recovering, reloadProfile, signOut } = useAuth();

  const pathname = usePathname();
  const ready = !!session && !recovering && isAdultConfirmed;

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);

  // Dopo l'accesso, porta dove l'utente voleva andare (es. al link di Slot singolo).
  useEffect(() => {
    if (!ready) return;
    const target = takePendingPath();
    if (target && target !== pathname) router.replace(target as Href);
  }, [ready, pathname]);

  if (isLoading) return <LoadingView />;

  if (session && profileError) {
    return (
      <Screen>
        <Title>{t('errors.profileLoad')}</Title>
        <Body muted>{t('errors.generic')}</Body>
        <Spacer />
        <Button title={t('common.retry')} onPress={reloadProfile} />
        <Spacer size={12} />
        <Button title={t('settings.signOut')} variant="ghost" onPress={() => void signOut()} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, scrollEdgeEffects: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      {/* Chi arriva dal link di recupero ha già una sessione, ma deve prima scegliere la nuova password. */}
      <Stack.Protected guard={!session || recovering}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !recovering && !isAdultConfirmed}>
        <Stack.Screen name="adult" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !recovering && isAdultConfirmed}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Carattere del tema (Inter Tight): finché non è caricato resta lo splash; se il caricamento fallisce si usa quello di sistema.
  const [fontsLoaded, fontsError] = useFonts({ InterTight_300Light, InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold });
  if (!fontsLoaded && !fontsError) return null;
  return (
    <KeyboardProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </KeyboardProvider>
  );
}
