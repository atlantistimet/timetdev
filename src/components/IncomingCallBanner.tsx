import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { acceptCall, callsSupported, declineCall, loadIncomingCall, type CallRow } from '@/lib/calls';
import { useTheme } from '@/theme';

type Incoming = CallRow & { client_name: string | null };

/** Avviso "ti stanno chiamando": in alto su ogni schermata, finché il venditore non risponde o scade il minuto. Per ora interroga il server ogni 3 secondi. */
export function IncomingCallBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const pathname = usePathname();
  const [call, setCall] = useState<Incoming | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me || !callsSupported) return;
    let alive = true;
    const check = async () => {
      const found = await loadIncomingCall(me);
      if (alive) setCall(found);
    };
    void check();
    const timer = setInterval(() => void check(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [me]);

  if (!call || pathname.startsWith('/call/')) return null;

  const answer = async () => {
    setBusy(true);
    const res = await acceptCall(call.id);
    setBusy(false);
    setCall(null);
    if (res.data) router.push({ pathname: '/call/[id]', params: { id: call.id } });
  };
  const decline = async () => {
    setBusy(true);
    await declineCall(call.id);
    setBusy(false);
    setCall(null);
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.surface }]} pointerEvents="box-none">
      <Body>{t('calls.incomingFrom', { name: call.client_name ?? '' })}</Body>
      <Body muted>{call.service_title}</Body>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title={t('calls.answer')} onPress={() => void answer()} loading={busy} />
        </View>
        <View style={styles.flex}>
          <Button title={t('calls.decline')} variant="ghost" onPress={() => void decline()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 12, left: 12, right: 12, padding: 16, borderRadius: 16, zIndex: 100, elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  flex: { flex: 1 },
});
