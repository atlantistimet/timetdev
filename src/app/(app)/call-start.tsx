import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PaymentForm } from '@/components/PaymentForm';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
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
    const result = await startCall(service.id);
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

  return (
    <Screen>
      <Title>{service.title}</Title>
      <Body muted>{`${seller?.full_name ?? ''} · ${t('calls.rateLine', { price: fmt(service.rate_cents_per_min) })}`}</Body>
      <Spacer />
      <Card>
        <Body>{t('calls.howItWorksTitle')}</Body>
        <Body muted>{t('calls.howItWorks')}</Body>
        <Spacer size={8} />
        <Body muted>{t('calls.hold', { minutes: CALL_BLOCK_MIN, amount: fmt(clientCallTotal(service.rate_cents_per_min, CALL_BLOCK_MIN)) })}</Body>
        <Body muted>{t('calls.limits', { min: CALL_MIN_BILLED_MIN, max: CALL_MAX_MIN, minAmount: fmt(clientCallTotal(service.rate_cents_per_min, CALL_MIN_BILLED_MIN)) })}</Body>
      </Card>
      <Spacer />
      {!callsSupported ? <ErrorText>{t('calls.nativeNotReady')}</ErrorText> : null}
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {started ? (
        busy ? (
          <LoadingView />
        ) : (
          <PaymentForm clientSecret={started.client_secret} stripeAccount={started.stripe_account} onPaid={() => void paid()} />
        )
      ) : (
        <Button title={t('calls.startButton')} onPress={() => void begin()} loading={busy} />
      )}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} />
    </Screen>
  );
}
