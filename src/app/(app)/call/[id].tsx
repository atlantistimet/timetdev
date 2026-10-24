import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CallRoom } from '@/components/CallRoom';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import {
  acceptCall, callsSupported, callToken, cancelCall, clientCallTotal, declineCall, endCall, heartbeat, loadCall, type CallRow,
} from '@/lib/calls';

const nowMs = () => Date.now();
const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Una chiamata: squillo, conversazione e riepilogo. Lo stato vero sta sul server: qui si legge ogni 2 secondi e si manda un battito ogni 8. */
export default function CallScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { id } = useLocalSearchParams<{ id: string }>();
  const [call, setCall] = useState<CallRow | null | 'missing'>(null);
  const [room, setRoom] = useState<{ url: string; token: string } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [now, setNow] = useState(nowMs());
  const tokenRequested = useRef(false);
  const fmt = (cents: number) => formatEuro(cents, i18n.language);

  const refresh = useCallback(async () => {
    if (!id) return;
    const row = await loadCall(id);
    setCall(row ?? 'missing');
  }, [id]);

  // lettura dello stato + orologio
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const poll = setInterval(() => void refresh(), 2000);
    const tick = setInterval(() => setNow(nowMs()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // battito di presenza finché la chiamata è viva
  const live = call && call !== 'missing' && ['ringing', 'active'].includes(call.status);
  useEffect(() => {
    if (!live || !id) return;
    void heartbeat(id);
    const beat = setInterval(() => void heartbeat(id).then(() => refresh()), 8000);
    return () => clearInterval(beat);
  }, [live, id, refresh]);

  // quando la chiamata diventa attiva si chiede il token per la stanza
  const active = call && call !== 'missing' && call.status === 'active';
  useEffect(() => {
    if (!active || !id || tokenRequested.current || !callsSupported) return;
    tokenRequested.current = true;
    void callToken(id).then((res) => {
      if (res.data) setRoom({ url: res.data.url, token: res.data.token });
      else {
        tokenRequested.current = false;
        setErrorKey(res.errorKey);
      }
    });
  }, [active, id]);

  if (!call) return <LoadingView />;
  if (call === 'missing' || (call.client_id !== me && call.seller_id !== me)) {
    return (
      <Screen>
        <Title>{t('calls.errors.not_found')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const isClient = call.client_id === me;
  const leave = () => router.replace(isClient ? '/services' : '/profile');
  const startedMs = call.started_at ? Date.parse(call.started_at) : null;
  const elapsed = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;
  const billedNow = Math.min(Math.max(Math.ceil(elapsed / 60), 5), 60);
  const coveredUntil = startedMs ? startedMs + call.blocks_held * 15 * 60_000 : null;
  const secondsLeft = coveredUntil ? Math.max(0, Math.floor((coveredUntil - now) / 1000)) : null;
  const ringLeft = call.ring_expires_at ? Math.max(0, Math.floor((Date.parse(call.ring_expires_at) - now) / 1000)) : 0;

  const act = async (fn: (callId: string) => Promise<{ errorKey: string | null }>) => {
    setErrorKey(null);
    const res = await fn(call.id);
    if (res.errorKey) setErrorKey(res.errorKey);
    await refresh();
  };

  if (call.status === 'ringing') {
    return (
      <Screen>
        <Title>{t(isClient ? 'calls.calling' : 'calls.incoming')}</Title>
        <Body muted>{call.service_title}</Body>
        <Spacer />
        <Body>{t('calls.ringLeft', { seconds: ringLeft })}</Body>
        <Spacer />
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
        {isClient ? (
          <Button title={t('calls.cancel')} variant="ghost" onPress={() => void act(cancelCall)} />
        ) : (
          <>
            <Button title={t('calls.answer')} onPress={() => void act(acceptCall)} />
            <Spacer size={12} />
            <Button title={t('calls.decline')} variant="ghost" onPress={() => void act(declineCall)} />
          </>
        )}
      </Screen>
    );
  }

  if (call.status === 'active') {
    return (
      <Screen>
        <Title>{call.service_title ?? t('calls.title')}</Title>
        <Body muted>
          {t('calls.timer', { time: mmss(elapsed) })}
          {' · '}
          {isClient ? t('calls.costSoFar', { amount: fmt(clientCallTotal(call.rate_cents_per_min, billedNow)) }) : t('calls.minutesBilled', { minutes: billedNow })}
        </Body>
        {secondsLeft !== null && secondsLeft < 180 && call.extend_failed ? <ErrorText>{t('calls.extendFailed', { time: mmss(secondsLeft) })}</ErrorText> : null}
        <Spacer />
        {!callsSupported ? <ErrorText>{t('calls.nativeNotReady')}</ErrorText> : null}
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
        {room ? <CallRoom serverUrl={room.url} token={room.token} onDisconnected={() => void act(endCall)} /> : callsSupported && !errorKey ? <LoadingView /> : null}
        <Spacer />
        <Button title={t('calls.hangUp')} onPress={() => void act(endCall)} />
      </Screen>
    );
  }

  // concluse
  const messages: Record<string, string> = { missed: 'calls.missed', declined: 'calls.declinedMsg', cancelled: 'calls.cancelledMsg' };
  const dropped = call.end_reason === 'error';
  const clientPaid = call.amount_cents + call.client_fee_cents;
  const sellerGets = call.amount_cents - call.seller_fee_cents;
  return (
    <Screen>
      <Title>{call.status === 'ended' ? t('calls.endedTitle') : t(messages[call.status] ?? 'calls.cancelledMsg')}</Title>
      <Spacer />
      {call.status === 'ended' ? (
        <Card>
          <Body>{call.service_title}</Body>
          <Body muted>{t('calls.billedMinutes', { minutes: call.billed_minutes })}</Body>
          <Body muted>{isClient ? t('calls.youPaid', { amount: fmt(clientPaid) }) : t('calls.youReceive', { amount: fmt(sellerGets) })}</Body>
          {dropped ? <Body muted>{t('calls.droppedNote')}</Body> : null}
          {call.end_reason === 'balance' ? <Body muted>{t('calls.limitNote')}</Body> : null}
        </Card>
      ) : (
        <Body muted>{t('calls.nothingCharged')}</Body>
      )}
      <Spacer />
      <Button title={t('common.back')} onPress={leave} />
    </Screen>
  );
}
