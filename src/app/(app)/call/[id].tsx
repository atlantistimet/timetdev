import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { PaymentForm } from '@/components/PaymentForm';
import { Emoji } from '@/components/Emoji';
import { CallChat } from '@/components/CallChat';
import { CallRoom } from '@/components/CallRoom';
import { Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { fonts, pastelFor, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatEuro } from '@/lib/booking';
import { callReviewExists, createCallReview, type CallMood } from '@/lib/reviews';
import { createTipPayment } from '@/lib/sessions';
import {
  acceptCall, CALL_EXTRA_MINUTES, CALL_MAX_MIN, callsSupported, callToken, cancelCall, clientCallTotal, declineCall, endCall, extendCall, heartbeat, heldMinutes, loadCall, type CallRow,
} from '@/lib/calls';

const nowMs = () => Date.now();
const MOODS: { key: CallMood; emoji: string }[] = [
  { key: 'top', emoji: 'raising_hands' },
  { key: 'idee', emoji: 'light_bulb' },
  { key: 'bello', emoji: 'smiling_eyes' },
  { key: 'carica', emoji: 'fire' },
];
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
  const [reconnects, setReconnects] = useState(0);
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

  // nome dell'altra persona (venditore per il cliente, cliente per il venditore)
  const otherId = call && call !== 'missing' ? (call.client_id === me ? call.seller_id : call.client_id) : null;
  const [other, setOther] = useState<{ name: string; avatar: string | null; handle: string | null } | null>(null);
  const [myName, setMyName] = useState('');
  const theme = useTheme();
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [mood, setMood] = useState<CallMood | null>(null);
  const [tip, setTip] = useState(0);
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [tipPay, setTipPay] = useState<{ client_secret: string; stripe_account: string; amount_cents: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  useEffect(() => {
    if (!otherId) return;
    let alive = true;
    void supabase.from('profiles').select('full_name, avatar_path, handle').eq('id', otherId).maybeSingle().then(({ data }) => {
      if (alive && data) setOther({ name: data.full_name as string, avatar: (data.avatar_path as string | null) ?? null, handle: (data.handle as string | null) ?? null });
    });
    void supabase.from('profiles').select('full_name').eq('id', me).maybeSingle().then(({ data }) => {
      if (alive) setMyName((data?.full_name as string | undefined) ?? '');
    });
    return () => {
      alive = false;
    };
  }, [otherId, me]);

  useEffect(() => {
    let alive = true;
    if (id) void callReviewExists(id).then((x) => alive && setReviewed(x));
    return () => {
      alive = false;
    };
  }, [id]);

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
  }, [active, id, reconnects]);

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
  const leave = () => router.replace(isClient ? '/services' : '/bookings');
  const startedMs = call.started_at ? Date.parse(call.started_at) : null;
  const elapsed = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;
  const billedNow = Math.min(Math.max(Math.ceil(elapsed / 60), 5), 60);
  const held = heldMinutes(call);
  const coveredUntil = startedMs ? startedMs + held * 60_000 : null;
  const secondsLeft = coveredUntil ? Math.max(0, Math.floor((coveredUntil - now) / 1000)) : null;
  const ringLeft = call.ring_expires_at ? Math.max(0, Math.floor((Date.parse(call.ring_expires_at) - now) / 1000)) : 0;

  /** La linea è caduta: la chiamata resta aperta sul server (che la chiude da solo se nessuno torna) e ci si ricollega con un nuovo token. */
  const reconnect = (reason?: number) => {
    if (reason === 2) return; // identità doppia: la stanza è aperta da un'altra schermata o dispositivo, ricollegarsi li farebbe espellere a vicenda
    setRoom(null);
    tokenRequested.current = false;
    setTimeout(() => setReconnects((n) => n + 1), 1500);
  };
  const confirmHangup = () => {
    Alert.alert(t('calls.hangupTitle'), t('calls.hangupBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('calls.hangupConfirm'), style: 'destructive', onPress: () => void act(endCall) },
    ]);
  };

  const add = async (minutes: number) => {
    setAdding(true);
    setAddError(null);
    const res = await extendCall(call.id, minutes);
    setAdding(false);
    if (res.errorKey) return setAddError(res.errorKey);
    setAddOpen(false);
    await refresh();
  };

  const act = async (fn: (callId: string) => Promise<{ errorKey: string | null }>) => {
    setErrorKey(null);
    const res = await fn(call.id);
    if (res.errorKey) setErrorKey(res.errorKey);
    await refresh();
  };

  const otherName = other?.name ?? '';
  const first = otherName.split(' ')[0];
  const seed = otherId ?? '';
  const total15 = clientCallTotal(call.rate_cents_per_min, 15);

  const send = async () => {
    setSending(true);
    setSendError(null);
    if (reviewed === false && rating > 0) {
      const failure = await createCallReview({ callId: call.id, authorId: me, sellerId: call.seller_id, rating, mood, lang: i18n.language.slice(0, 2) });
      if (failure && failure !== 'reviews.already') {
        setSending(false);
        return setSendError(failure);
      }
      setReviewed(true);
    }
    if (tip > 0) {
      const r = await createTipPayment({ callId: call.id }, tip);
      setSending(false);
      if (r.payment) setTipPay(r.payment);
      else setSendError(r.errorKey);
      return;
    }
    setSending(false);
    leave();
  };

  if (call.status === 'ringing') {
    if (isClient) {
      return (
        <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]}>
          <View style={styles.frame}>
            <View style={[styles.panel, { backgroundColor: pastelFor(seed), alignItems: 'center' }]}>
              <Text style={[styles.small, { color: theme.ink }]}>{t('calls.calling')}</Text>
              <View style={{ marginTop: 22 }}>
                <Avatar name={otherName || '?'} seed={seed} size={176} round={60} path={other?.avatar} />
              </View>
              <Text style={[styles.bigName, { color: theme.ink, marginTop: 10 }]}>{otherName}</Text>
              <View style={styles.dots}>
                {[1, 0.45, 0.2].map((o) => (
                  <View key={o} style={[styles.dotRing, { backgroundColor: theme.ink, opacity: o }]} />
                ))}
              </View>
              <View style={[styles.timerBox, { backgroundColor: theme.ink }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.timerSmall, { color: theme.inkMuted }]}>{t('calls.timeToAnswer')}</Text>
                  <Text style={[styles.timerBig, { color: theme.accent }]}>{mmss(ringLeft)}</Text>
                </View>
                <Text style={[styles.timerNote, { color: theme.inkMuted }]}>{t('calls.noAnswerNoPay')}</Text>
              </View>
            </View>
            <View style={styles.holdRow}>
              <View style={{ flex: 1, paddingLeft: 14 }}>
                <Text style={[styles.holdTitle, { color: theme.text }]}>{t('calls.blocked', { amount: fmt(total15) })}</Text>
                <Text style={[styles.holdSub, { color: theme.muted }]}>{t('calls.blockedSub', { minutes: 15, rate: fmt(call.rate_cents_per_min) })}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('calls.cancel')} onPress={() => void act(cancelCall)} style={styles.redPill}>
                <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
              </Pressable>
            </View>
            {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.ink }]}>
        <View style={styles.frame}>
          <View style={[styles.panel, { backgroundColor: '#C9DCC2', alignItems: 'center', gap: 18 }]}>
            <View style={[styles.pill, { backgroundColor: theme.ink }]}>
              <Emoji name="stopwatch" size={20} />
              <Text style={styles.pillText}>{t('calls.perMinuteTag')}</Text>
            </View>
            <View style={{ marginTop: 18 }}>
              <Avatar name={otherName || '?'} seed={seed} size={168} path={other?.avatar} />
            </View>
            <View style={{ marginTop: 26, alignItems: 'center', gap: 4 }}>
              <Text style={[styles.bigName, { color: theme.ink, fontSize: 38 }]}>{otherName}</Text>
              <Text style={[styles.small, { color: theme.ink, fontSize: 16, textAlign: 'center' }]}>{t('calls.callingYouFor', { title: call.service_title ?? '' })}</Text>
            </View>
            <View style={styles.triple}>
              <View style={[styles.stat, { backgroundColor: 'rgba(255,255,255,0.65)' }]}>
                <Text style={[styles.statBig, { color: theme.ink }]}>{fmt(call.rate_cents_per_min)}</Text>
                <Text style={[styles.statSmall, { color: theme.ink }]}>{t('calls.perMin')}</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: 'rgba(255,255,255,0.65)' }]}>
                <Text style={[styles.statBig, { color: theme.ink }]}>{"15'"}</Text>
                <Text style={[styles.statSmall, { color: theme.ink }]}>{t('calls.alreadyBlocked')}</Text>
              </View>
              <View style={[styles.stat, { backgroundColor: theme.accent }]}>
                <Text style={[styles.statBig, { color: theme.ink }]}>{mmss(ringLeft)}</Text>
                <Text style={[styles.statSmall, { color: theme.ink }]}>{t('calls.toAnswer')}</Text>
              </View>
            </View>
          </View>
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          <View style={styles.answerRow}>
            <Pressable accessibilityRole="button" onPress={() => void act(declineCall)} style={[styles.answerBtn, { flex: 1, backgroundColor: '#D93A3F' }]}>
              <Ionicons name="call" size={24} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={[styles.answerText, { color: '#FFFFFF' }]}>{t('calls.decline')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void act(acceptCall)} style={[styles.answerBtn, { flex: 1.4, backgroundColor: theme.accent }]}>
              <Ionicons name="call" size={24} color={theme.ink} />
              <Text style={[styles.answerText, { color: theme.ink }]}>{t('calls.answer')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (call.status === 'active') {
    const blockedMin = held;
    const progress = coveredUntil && startedMs ? Math.min(1, Math.max(0, (now - startedMs) / (coveredUntil - startedMs))) : 0;
    const timerCard = (
      <View style={[styles.minutes, { backgroundColor: theme.ink }]}>
        <View style={styles.minutesRow}>
          <View>
            <Text style={[styles.timerSmall, { color: theme.inkMuted }]}>{t('calls.minutesLeft')}</Text>
            <Text style={[styles.minutesBig, { color: theme.accent }]}>{mmss(secondsLeft ?? 0)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.minutesPrice}>{isClient ? fmt(clientCallTotal(call.rate_cents_per_min, billedNow)) : t('calls.minutesBilled', { minutes: billedNow })}</Text>
            <Text style={[styles.timerSmall, { color: theme.inkMuted }]}>{t('calls.blockedMinutes', { minutes: blockedMin })}</Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: theme.inkSurface2 }]}>
          <View style={[styles.fillBar, { width: `${Math.round((1 - progress) * 100)}%`, backgroundColor: theme.accent }]} />
        </View>
        {secondsLeft !== null && secondsLeft < 180 ? <Text style={[styles.timerNote, { color: '#F97066', maxWidth: undefined }]}>{t(isClient && held < CALL_MAX_MIN ? 'calls.endingSoonAdd' : 'calls.endingSoon', { time: mmss(secondsLeft) })}</Text> : null}
      </View>
    );
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: theme.bg }]}>
        <View style={[styles.frame, { paddingBottom: 12 }]}>
          {!callsSupported ? <ErrorText>{t('calls.nativeNotReady')}</ErrorText> : null}
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          {room ? (
            <CallRoom serverUrl={room.url} token={room.token} onDisconnected={reconnect} onHangup={confirmHangup} name={otherName} avatarPath={other?.avatar} seed={seed} myName={myName} chat={otherId ? <CallChat me={me} otherId={otherId} /> : undefined} onAddMinutes={isClient && held < CALL_MAX_MIN ? () => setAddOpen(true) : undefined}>
              {timerCard}
            </CallRoom>
          ) : callsSupported && !errorKey ? (
            <LoadingView />
          ) : null}
        </View>
        <SheetModal  visible={addOpen} onRequestClose={() => setAddOpen(false)}>
          <View style={[styles.scrim]}>
            <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
              <View style={[styles.grabber, { backgroundColor: theme.fill }]} />
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('calls.addTitle')}</Text>
              <Text style={[styles.holdSub, { color: theme.muted, fontSize: 14 }]}>{t('calls.addBody', { max: CALL_MAX_MIN - held })}</Text>
              <View style={styles.addRow}>
                {CALL_EXTRA_MINUTES.filter((m) => held + m <= CALL_MAX_MIN).map((m) => (
                  <Pressable key={m} accessibilityRole="button" disabled={adding} onPress={() => void add(m)} style={[styles.addChip, { backgroundColor: theme.bg, opacity: adding ? 0.5 : 1 }]}>
                    <Text style={[styles.addMin, { color: theme.text }]}>{`+${m}'`}</Text>
                    <Text style={[styles.holdSub, { color: theme.muted }]}>{fmt(clientCallTotal(call.rate_cents_per_min, m) - 50)}</Text>
                  </Pressable>
                ))}
              </View>
              {addError ? <ErrorText>{t(addError)}</ErrorText> : null}
              <Pressable accessibilityRole="button" onPress={() => setAddOpen(false)} style={[styles.answerBtn, { backgroundColor: theme.bg, height: 52 }]}>
                <Text style={[styles.answerText, { color: theme.text, fontSize: 15 }]}>{t('common.close')}</Text>
              </Pressable>
            </View>
          </View>
        </SheetModal>
      </SafeAreaView>
    );
  }

  // concluse
  const dropped = call.end_reason === 'error';
  const clientPaid = call.amount_cents + call.client_fee_cents;
  const sellerGets = call.amount_cents - call.seller_fee_cents;
  const talked = call.started_at && call.ended_at ? Math.max(0, Math.round((Date.parse(call.ended_at) - Date.parse(call.started_at)) / 1000)) : 0;

  if (call.status === 'ended') {
    return (
      <Screen bare>
        <View style={styles.doneWrap}>
          <View style={[styles.donePanel, { backgroundColor: theme.accent }]}>
            <View style={styles.doneTop}>
              <Avatar name={otherName || '?'} seed={seed} size={52} path={other?.avatar} />
              <Emoji name="party_popper" size={56} />
            </View>
            <Text style={[styles.doneTitle, { color: theme.onAccent }]}>{t('calls.doneTitle')}</Text>
            <View style={styles.doneTiles}>
              <View style={[styles.doneTile, { backgroundColor: theme.ink }]}>
                <Text style={[styles.statSmall, { color: theme.inkMuted }]}>{t('calls.duration')}</Text>
                <Text style={[styles.doneBig, { color: theme.accent }]}>{mmss(talked)}</Text>
              </View>
              <View style={[styles.doneTile, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                <Text style={[styles.statSmall, { color: theme.onAccent }]}>{isClient ? t('calls.total') : t('calls.youGet')}</Text>
                <Text style={[styles.doneBig, { color: theme.onAccent }]}>{fmt(isClient ? clientPaid : sellerGets)}</Text>
              </View>
            </View>
          </View>
          {isClient && tipPay ? (
            <View style={[styles.rateCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.rateTitle, { color: theme.text }]}>{t('calls.tipPay', { amount: fmt(tipPay.amount_cents) })}</Text>
              <PaymentForm clientSecret={tipPay.client_secret} stripeAccount={tipPay.stripe_account} onPaid={leave} />
            </View>
          ) : isClient ? (
            <>
              {reviewed === false ? (
                <View style={[styles.rateCard, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.rateTitle, { color: theme.text }]}>{t('calls.howWasIt', { name: first })}</Text>
                  <View style={styles.moods}>
                    {MOODS.map((m) => (
                      <Pressable key={m.key} accessibilityRole="button" accessibilityState={{ selected: mood === m.key }} onPress={() => setMood(mood === m.key ? null : m.key)} style={[styles.mood, { backgroundColor: mood === m.key ? theme.accent : theme.bg, borderColor: mood === m.key ? theme.ink : 'transparent' }]}>
                        <Emoji name={m.emoji} size={34} />
                        <Text style={[styles.moodText, { color: theme.text }]}>{t(`calls.mood.${m.key}`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n}`} onPress={() => setRating(n)} style={styles.starHit}>
                        <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={n <= rating ? theme.ink : theme.muted} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={[styles.rateCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.rateTitle, { color: theme.text }]}>{t('calls.tipTitle')}</Text>
                <View style={styles.tipRow}>
                  {[0, 200, 500, 1000].map((c) => (
                    <Pressable key={c} accessibilityRole="button" onPress={() => setTip(c)} style={[styles.tipBtn, { backgroundColor: tip === c ? theme.ink : theme.bg }]}>
                      <Text style={[styles.tipText, { color: tip === c ? '#FFFFFF' : theme.text }]}>{c === 0 ? t('calls.tipNone') : fmt(c).replace(',00', '')}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {sendError ? <ErrorText>{t(sendError)}</ErrorText> : null}
            </>
          ) : null}
          {dropped ? <Text style={[styles.holdSub, { color: theme.muted, paddingHorizontal: 12 }]}>{t('calls.droppedNote')}</Text> : null}
          {call.end_reason === 'balance' ? <Text style={[styles.holdSub, { color: theme.muted, paddingHorizontal: 12 }]}>{t('calls.limitNote')}</Text> : null}
          <View style={styles.doneButtons}>
            {isClient && call.service_id ? (
              <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/call-start', params: { serviceId: call.service_id ?? '' } })} style={[styles.answerBtn, { flex: 1, backgroundColor: theme.surface }]}>
                <Text style={[styles.answerText, { color: theme.text, fontSize: 16 }]}>{t('calls.bookAgain')}</Text>
              </Pressable>
            ) : null}
            {isClient && !tipPay ? (
              <Pressable accessibilityRole="button" disabled={sending} onPress={() => void send()} style={[styles.answerBtn, { flex: 1, backgroundColor: theme.ink, opacity: sending ? 0.6 : 1 }]}>
                <Text style={[styles.answerText, { color: '#FFFFFF', fontSize: 16 }]}>{tip > 0 ? t('calls.sendTip', { amount: fmt(tip).replace(',00', '') }) : reviewed === false && rating > 0 ? t('calls.send') : t('calls.done')}</Text>
              </Pressable>
            ) : !isClient ? (
              <Pressable accessibilityRole="button" onPress={leave} style={[styles.answerBtn, { flex: 1, backgroundColor: theme.ink }]}>
                <Text style={[styles.answerText, { color: '#FFFFFF', fontSize: 16 }]}>{t('calls.done')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  const missedKey = call.status === 'missed' ? 'calls.missedTitle' : call.status === 'declined' ? 'calls.declinedTitle' : 'calls.cancelledMsg';
  return (
    <Screen bare>
      <View style={styles.doneWrap}>
        <View style={[styles.donePanel, { backgroundColor: theme.surface, alignItems: 'center', gap: 24, paddingTop: 56 }]}>
          <View style={{ opacity: 0.55 }}>
            <Avatar name={otherName || '?'} seed={seed} size={120} round={44} path={other?.avatar} />
          </View>
          <Text style={[styles.doneTitle, { color: theme.text, fontSize: 34, textAlign: 'center' }]}>{t(missedKey, { name: first })}</Text>
          <Text style={[styles.holdSub, { color: theme.muted, fontSize: 16, lineHeight: 22, textAlign: 'center' }]}>{t(call.status === 'missed' ? 'calls.missedBody' : 'calls.nothingCharged')}</Text>
          <View style={[styles.okPill, { backgroundColor: theme.successSoft }]}>
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
            <Text style={[styles.okText, { color: theme.success }]}>{t('calls.noCharge')}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => otherId && router.replace({ pathname: '/chat/[userId]', params: { userId: otherId } })} style={[styles.msgCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.msgIcon, { backgroundColor: theme.bg }]}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.holdTitle, { color: theme.text, fontSize: 16 }]}>{t('calls.writeHer')}</Text>
            <Text style={[styles.holdSub, { color: theme.muted }]}>{t('calls.writeHerSub')}</Text>
          </View>
        </Pressable>
        <View style={styles.doneButtons}>
          <Pressable accessibilityRole="button" onPress={leave} style={[styles.answerBtn, { flex: 1, backgroundColor: theme.surface }]}>
            <Text style={[styles.answerText, { color: theme.text, fontSize: 16 }]}>{t('calls.close')}</Text>
          </Pressable>
          {isClient && call.service_id ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/call-start', params: { serviceId: call.service_id ?? '' } })} style={[styles.answerBtn, { flex: 1.3, backgroundColor: theme.ink }]}>
              <Text style={[styles.answerText, { color: '#FFFFFF', fontSize: 16 }]}>{t('calls.callAgain')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rateCard: { borderRadius: 32, padding: 18, gap: 12 },
  rateTitle: { fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.4 },
  moods: { flexDirection: 'row', gap: 6 },
  mood: { flex: 1, height: 78, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2 },
  moodText: { fontFamily: fonts.semibold, fontSize: 12 },
  stars: { flexDirection: 'row', gap: 2 },
  starHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tipRow: { flexDirection: 'row', gap: 6 },
  tipBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tipText: { fontFamily: fonts.semibold, fontSize: 16 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 22, paddingBottom: 32, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: -1 },
  addRow: { flexDirection: 'row', gap: 8 },
  addChip: { flex: 1, borderRadius: 22, paddingVertical: 14, alignItems: 'center', gap: 2 },
  addMin: { fontFamily: fonts.semibold, fontSize: 20 },
  fill: { flex: 1 },
  frame: { flex: 1, padding: 8, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },
  panel: { flex: 1, borderRadius: 40, padding: 22, paddingTop: 56, gap: 16 },
  small: { fontFamily: fonts.semibold, fontSize: 15 },
  bigName: { fontFamily: fonts.semibold, fontSize: 36, letterSpacing: -1.6 },
  dots: { flexDirection: 'row', gap: 6 },
  dotRing: { width: 10, height: 10, borderRadius: 5 },
  timerBox: { marginTop: 'auto', alignSelf: 'stretch', borderRadius: 30, padding: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  timerSmall: { fontFamily: fonts.regular, fontSize: 13 },
  timerBig: { fontFamily: fonts.semibold, fontSize: 44, letterSpacing: -2.2 },
  timerNote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, maxWidth: 150 },
  holdRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  holdTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  holdSub: { fontFamily: fonts.regular, fontSize: 13 },
  redPill: { width: 92, height: 64, borderRadius: 32, backgroundColor: '#D93A3F', alignItems: 'center', justifyContent: 'center' },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 14 },
  triple: { marginTop: 'auto', alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 24, padding: 12 },
  statBig: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  statSmall: { fontFamily: fonts.medium, fontSize: 12 },
  answerRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 6 },
  answerBtn: { height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  answerText: { fontFamily: fonts.semibold, fontSize: 17 },
  minutes: { borderRadius: 34, padding: 18, paddingHorizontal: 20, gap: 12 },
  minutesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  minutesBig: { fontFamily: fonts.semibold, fontSize: 72, lineHeight: 68, letterSpacing: -4.3 },
  minutesPrice: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 20 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 3 },
  doneWrap: { flex: 1, padding: 8, paddingBottom: 24, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },
  donePanel: { borderRadius: 38, padding: 20, paddingTop: 52, gap: 14 },
  doneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  doneTitle: { fontFamily: fonts.semibold, fontSize: 38, lineHeight: 38, letterSpacing: -1.7 },
  doneTiles: { flexDirection: 'row', gap: 8 },
  doneTile: { flex: 1, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  doneBig: { fontFamily: fonts.semibold, fontSize: 34, letterSpacing: -1.7 },
  doneButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  okPill: { height: 40, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  okText: { fontFamily: fonts.semibold, fontSize: 15 },
  msgCard: { borderRadius: 32, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  msgIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
