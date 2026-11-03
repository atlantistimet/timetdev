import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { useAuth } from '@/lib/auth';
import { callsSupported, loadLiveCall, type CallRow } from '@/lib/calls';
import { fonts, useTheme } from '@/theme';

// All'apertura dell'app, se hai una chiamata in corso, ti ci porta una sola volta.
let openedOnce = false;

/** Barra «Chiamata in corso · Rientra»: se chiudi l'app o esci dalla chiamata per sbaglio, da qui ci torni. */
export function ActiveCallBar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const pathname = usePathname();
  const [call, setCall] = useState<CallRow | null>(null);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!me || !callsSupported) return;
    let alive = true;
    const check = async () => {
      const found = await loadLiveCall(me);
      if (!alive) return;
      // la chiamata che sta squillando a te venditore la gestisce l'avviso in arrivo
      const mine = found && (found.status === 'active' || found.client_id === me) ? found : null;
      setCall(mine);
      if (mine && mine.status === 'active' && !openedOnce) {
        openedOnce = true;
        // se la chiamata è già aperta (anche appena risposta) non se ne apre una seconda: due schermate = stessa identità due volte nella stanza
        if (!pathRef.current.startsWith('/call/')) router.push({ pathname: '/call/[id]', params: { id: mine.id } });
      }
    };
    void check();
    const timer = setInterval(() => void check(), 4000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [me]);

  if (!call || pathname.startsWith('/call/')) return null;
  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/call/[id]', params: { id: call.id } })}
        style={[styles.bar, { backgroundColor: theme.accent }]}
      >
        <View style={[styles.dot, { backgroundColor: theme.ink }]} />
        <Text style={[styles.text, { color: theme.ink }]}>{t(call.status === 'active' ? 'calls.liveBar' : 'calls.liveBarRinging')}</Text>
        <Text style={[styles.action, { color: theme.ink }]}>{t('calls.rejoin')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 90 },
  bar: { height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  action: { fontFamily: fonts.semibold, fontSize: 14 },
});
