import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { PaymentForm } from '@/components/PaymentForm';
import { Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { fonts, useTheme } from '@/theme';
import { formatEuro } from '@/lib/booking';
import {
  CALL_BLOCK_MIN, CALL_MAX_MIN, CALL_MIN_BILLED_MIN, callsSupported, clientCallTotal, confirmHold, loadCallService, startCall, type CallService, type StartedCall,
} from '@/lib/calls';
import { loadProfileById, type PublicProfile } from '@/lib/public-profile';

type Loaded = { service: CallService; seller: PublicProfile | null } | 'missing';

/** Il cliente vede come funziona, conferma la carta (blocco del primo quarto d'ora) e la chiamata parte. */
export default function CallStartScreen() {
  const { t, i18n } = useTranslation();
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [started, setStarted] = useState<StartedCall | null>(null);
  const [busy, setBusy] = useState(false);
  const theme = useTheme();
  const [minutes, setMinutes] = useState(CALL_BLOCK_MIN);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const service = serviceId ? await loadCallService(serviceId) : null;
      const seller = service ? await loadProfileById(service.seller_id) : null;
      if (alive) setLoaded(service && service.active ? { service, seller } : 'missing');
    })();
    return () => {
      alive = false;
    };
  }, [serviceId]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('calls.errors.service_not_found')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }
  const { service, seller } = loaded;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);

  const begin = async () => {
    setBusy(true);
    setErrorKey(null);
    const result = await startCall(service.id, minutes);
    setBusy(false);
    if (result.data) setStarted(result.data);
    else setErrorKey(result.errorKey);
  };

  const paid = async () => {
    if (!started) return;
    setBusy(true);
    const result = await confirmHold(started.call_id);
    setBusy(false);
    if (result.data) router.replace({ pathname: '/call/[id]', params: { id: started.call_id } });
    else {
      setStarted(null);
      setErrorKey(result.errorKey);
    }
  };

  const total = clientCallTotal(service.rate_cents_per_min, minutes);
  const steps = Array.from({ length: CALL_MAX_MIN / 5 }, (_, i) => (i + 1) * 5);
  return (
    <Screen bare>
      <View style={styles.wrap}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} style={[styles.round, { backgroundColor: theme.surface }]}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
          <View style={[styles.who, { backgroundColor: theme.surface }]}>
            <Text style={[styles.whoText, { color: theme.text }]}>{(seller?.full_name ?? '').split(' ')[0]}</Text>
            <Avatar name={seller?.full_name ?? '?'} seed={service.seller_id} size={34} path={seller?.avatar_path} />
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]}>{t('calls.blockTitle')}</Text>
          <View style={[styles.round, { backgroundColor: theme.surface, width: 56, height: 56, borderRadius: 28 }]}>
            <Emoji name="stopwatch" size={34} />
          </View>
        </View>
        <View style={[styles.panel, { backgroundColor: theme.surface }]}>
          <View style={styles.bigRow}>
            <View style={styles.minRow}>
              <Text style={[styles.minBig, { color: theme.text }]}>{minutes}</Text>
              <Text style={[styles.minUnit, { color: theme.muted }]}>min</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={[styles.price, { backgroundColor: theme.accent }]}>
                <Text style={[styles.priceText, { color: theme.onAccent }]}>{fmt(total)}</Text>
              </View>
              <Text style={[styles.rate, { color: theme.muted }]}>{t('calls.rateShort', { price: fmt(service.rate_cents_per_min) })}</Text>
            </View>
          </View>
          {started ? null : (
            <>
              <View style={styles.ruler}>
                {steps.map((m) => (
                  <Pressable key={m} accessibilityRole="button" accessibilityLabel={`${m} min`} onPress={() => setMinutes(m)} style={styles.tickHit}>
                    <View style={[styles.tick, { height: m % 15 === 0 ? 40 : 18, width: m === minutes ? 5 : 2, backgroundColor: m <= minutes ? theme.ink : theme.fill }]} />
                  </Pressable>
                ))}
              </View>
              <View style={styles.chips}>
                {[5, 10, 15, 30, 60].map((m) => (
                  <Pressable key={m} accessibilityRole="button" onPress={() => setMinutes(m)} style={[styles.chip, { backgroundColor: m === minutes ? theme.ink : theme.bg }]}>
                    <Text style={[styles.chipText, { color: m === minutes ? '#FFFFFF' : theme.text }]}>{`${m}'`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Text style={[styles.info, { color: theme.muted }]}>{t('calls.hold', { minutes, amount: fmt(total) })}</Text>
          <Text style={[styles.info, { color: theme.muted }]}>{t('calls.limits', { min: CALL_MIN_BILLED_MIN, max: CALL_MAX_MIN, minAmount: fmt(clientCallTotal(service.rate_cents_per_min, CALL_MIN_BILLED_MIN)) })}</Text>
          <Text style={[styles.info, { color: theme.muted }]}>{t('calls.howItWorks')}</Text>
        </View>
        {!callsSupported ? <ErrorText>{t('calls.nativeNotReady')}</ErrorText> : null}
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
        {started ? (
          busy ? (
            <LoadingView />
          ) : (
            <View style={[styles.panel, { backgroundColor: theme.surface, padding: 12 }]}>
              <PaymentForm clientSecret={started.client_secret} stripeAccount={started.stripe_account} onPaid={() => void paid()} />
            </View>
          )
        ) : (
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void begin()} style={[styles.cta, { backgroundColor: theme.ink, opacity: busy ? 0.6 : 1 }]}>
            <Text style={styles.ctaText}>{t('calls.startWith', { amount: fmt(total) })}</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 12, gap: 16, maxWidth: 440, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  who: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 6, borderRadius: 22 },
  whoText: { fontFamily: fonts.medium, fontSize: 15 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 36, lineHeight: 37, letterSpacing: -1.5 },
  panel: { borderRadius: 34, padding: 22, paddingHorizontal: 18, gap: 14 },
  bigRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  minRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  minBig: { fontFamily: fonts.semibold, fontSize: 108, lineHeight: 96, letterSpacing: -7.5 },
  minUnit: { fontFamily: fonts.medium, fontSize: 22 },
  price: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  priceText: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  rate: { fontFamily: fonts.regular, fontSize: 13 },
  ruler: { height: 52, flexDirection: 'row', alignItems: 'flex-end' },
  tickHit: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'flex-end' },
  tick: { borderRadius: 3 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 14 },
  info: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  cta: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 16 },
});
