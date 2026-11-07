import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ProfileTap } from '@/components/ProfileTap';
import { CancelSheet } from '@/components/BookingSheets';
import { PaymentForm } from '@/components/PaymentForm';
import { ReviewForm } from '@/components/ReviewForm';
import { Body, Button, Card, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { type CancelPreview } from '@/lib/cancel-policy';
import { fonts, pastelFor, useTheme } from '@/theme';
import { parseEuroToCents } from '@/lib/my-services';
import { stars } from '@/lib/reviews';
import { createTipPayment, loadSession, printSummary, requestInvoice, type SessionDetail } from '@/lib/sessions';

const TIPS = [200, 500, 1000];

export default function SessionScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<SessionDetail | null | 'missing'>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [invoiceKind, setInvoiceKind] = useState<'receipt' | 'invoice'>('receipt');
  const [details, setDetails] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showTip, setShowTip] = useState(false);
  const [tipChoice, setTipChoice] = useState<number | 'custom'>(500);
  const [customTip, setCustomTip] = useState('');
  const [tipPayment, setTipPayment] = useState<{ client_secret: string; stripe_account: string; amount_cents: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [cancelled, setCancelled] = useState<CancelPreview | null>(null);
  const theme = useTheme();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const s = await loadSession(id);
      if (alive) {
        setData(s ?? 'missing');
        setNowMs(Date.now());
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, reloadKey]);

  if (!data) return <LoadingView />;
  if (data === 'missing') {
    return (
      <Screen>
        <Title>{t('session.notFound')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />
      </Screen>
    );
  }

  const s = data;
  const isClient = s.client_id === me;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(s.starts_at));
  const minutes = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60_000);
  const paidByClient = s.price_cents + s.extra_cents + s.client_fee_cents;
  const sellerNet = s.price_cents + s.extra_cents - s.seller_fee_cents;
  const placeText = t(`bookings.place.${s.place}`) + (s.place === 'domicilio' && s.client_address ? ` · ${s.client_address}` : '');
  const openPerson = (handle: string | null) => handle && router.push({ pathname: '/u/[handle]', params: { handle } });

  const summaryLines = () => [
    `${t('session.service')}: ${s.service_title}`,
    ...(s.description ? [`${t('session.description')}: ${s.description}`] : []),
    `${t('session.when')}: ${when}`,
    `${t('session.duration')}: ${minutes} min`,
    `${t('session.where')}: ${placeText}`,
    `${t('session.seller')}: ${s.seller.full_name}`,
    `${t('session.client')}: ${s.client.full_name}`,
    `${t('session.status')}: ${t(`bookings.status.${s.status}`)}`,
    isClient
      ? `${t('session.amountPaid')}: ${s.paid ? fmt(paidByClient) : t('session.notPaid')}`
      : `${t('session.sellerNet')}: ${fmt(sellerNet)}`,
    ...(s.refund_cents > 0 ? [`${t('session.refunded')}: ${fmt(s.refund_cents)}`] : []),
    `ID: ${s.id}`,
  ];

  const sendRequest = async () => {
    setBusy(true);
    setErrorKey(null);
    const failure = await requestInvoice(s.id, me, invoiceKind, details);
    setBusy(false);
    if (failure) return setErrorKey(failure);
    setShowRequest(false);
    setNote(t('session.requestSent'));
    setReloadKey((k) => k + 1);
  };

  const startTip = async () => {
    const cents = tipChoice === 'custom' ? parseEuroToCents(customTip) : tipChoice;
    if (!cents || cents < 100 || cents > 20000) return setErrorKey('session.tipErrors.bad_amount');
    setBusy(true);
    setErrorKey(null);
    const r = await createTipPayment(s.id, cents);
    setBusy(false);
    if (r.payment) setTipPayment(r.payment);
    else setErrorKey(r.errorKey);
  };

  const canTip = isClient && s.status === 'completed';
  const canReview = isClient && s.status === 'completed' && !s.review;

  const other = isClient ? { id: s.seller_id, ...s.seller } : { id: s.client_id, ...s.client };
  const first = other.full_name.split(' ')[0];
  const startD = new Date(s.starts_at);
  const canCancel = s.status === 'confirmed' && new Date(s.ends_at).getTime() > nowMs;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/bookings'));
  const tile = (small: string, big: string) => (
    <View style={styles.tile}>
      <Text style={[styles.tileSmall, { color: theme.ink }]}>{small}</Text>
      <Text style={[styles.tileBig, { color: theme.ink }]}>{big}</Text>
    </View>
  );
  const line = (label: string, value: string, strong?: boolean) => (
    <View style={[styles.line, strong && { paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.fill }]}>
      <Text style={[styles.lineText, { color: strong ? theme.text : theme.muted, fontFamily: strong ? fonts.semibold : fonts.regular }]}>{label}</Text>
      <Text style={[styles.lineText, { color: theme.text, fontFamily: strong ? fonts.semibold : fonts.regular }]}>{value}</Text>
    </View>
  );

  if (cancelled) {
    return (
      <Screen bare>
        <View style={styles.doneWrap}>
          <View style={[styles.donePanel, { backgroundColor: theme.surface }]}>
            <View style={[styles.okIcon, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="checkmark" size={32} color={theme.success} />
            </View>
            <Text style={[styles.doneTitle, { color: theme.text }]}>{t('bookings.cancelledTitle')}</Text>
            <Text style={[styles.doneBody, { color: theme.muted }]}>{t('bookings.cancelledBody', { name: first })}</Text>
            {cancelled.paid && cancelled.refund_cents > 0 ? (
              <View style={[styles.refundBox, { backgroundColor: theme.accent }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.refundTitle, { color: theme.onAccent }]}>{t('bookings.refundComing')}</Text>
                  <Text style={[styles.refundSub, { color: theme.onAccent }]}>{t('bookings.refundSub')}</Text>
                </View>
                <Text style={[styles.refundBig, { color: theme.onAccent }]}>{fmt(cancelled.refund_cents)}</Text>
              </View>
            ) : null}
          </View>
          {isClient && s.service_id ? (
            <View style={[styles.moveCard, { backgroundColor: theme.surface }]}>
              <ProfileTap userId={other.id} handle={other.handle}><Avatar name={other.full_name} seed={other.id} size={48} path={other.avatar_path} /></ProfileTap>
              <View style={{ flex: 1 }}>
                <Text style={[styles.moveTitle, { color: theme.text }]}>{t('bookings.moveTitle')}</Text>
                <Text style={[styles.moveSub, { color: theme.muted }]}>{t('bookings.moveSub', { name: first })}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/book', params: { serviceId: s.service_id ?? '' } })} style={[styles.moveBtn, { backgroundColor: theme.ink }]}>
                <Text style={styles.moveBtnText}>{t('bookings.moveCta')}</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/bookings')} style={[styles.backBtn, { backgroundColor: theme.surface }]}>
            <Text style={[styles.backBtnText, { color: theme.text }]}>{t('bookings.backAgenda')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bare>
      <View style={[styles.hero, { backgroundColor: pastelFor(other.id) }]}>
        <View style={styles.heroTop}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back} style={styles.heroBack}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
          <View style={[styles.statusTag, { backgroundColor: theme.ink }]}>
            <Text style={styles.statusText}>{s.status === 'confirmed' && s.paid ? t('bookings.bookingStatus') : t(`bookings.status.${s.status}`)}</Text>
          </View>
        </View>
        <View style={styles.heroMid}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.heroTitle, { color: theme.ink }]}>{s.service_title}</Text>
            <Text style={[styles.heroSub, { color: theme.ink }]}>
              {s.packagePosition ? `${t('session.packageOf', { index: s.packagePosition.index, total: s.packagePosition.total })} · ` : ''}
              {t('bookings.withShort', { name: other.full_name })}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openPerson(other.handle)}>
            <Avatar name={other.full_name} seed={other.id} size={72} round={26} path={other.avatar_path} />
          </Pressable>
        </View>
        <View style={styles.tiles}>
          {tile(new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' }).format(startD), new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(startD))}
          {tile(t('book.durationLabel'), `${minutes}'`)}
          {tile(t('session.where'), t(`bookings.placeShort.${s.place}`))}
        </View>
      </View>
      <View style={styles.body}>
        {s.description ? <Text style={[styles.desc, { color: theme.muted }]}>{s.description}</Text> : null}
        {s.place === 'domicilio' && s.client_address ? <Text style={[styles.desc, { color: theme.muted }]}>{s.client_address}</Text> : null}
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          {isClient ? (
            <>
              {line(t('book.session'), fmt(s.price_cents))}
              {s.extra_cents > 0 ? line(t('book.spaceRow'), fmt(s.extra_cents)) : null}
              {line(t('book.feeRow'), fmt(s.client_fee_cents))}
              {line(s.paid ? t('session.amountPaid') : t('session.notPaid'), fmt(paidByClient), true)}
            </>
          ) : (
            <>
              {line(t('book.session'), fmt(s.price_cents + s.extra_cents))}
              {line(t('book.feeRow'), `−${fmt(s.seller_fee_cents)}`)}
              {line(t('session.sellerNet'), fmt(sellerNet), true)}
            </>
          )}
          {s.refund_cents > 0 ? line(t('session.refunded'), fmt(s.refund_cents)) : null}
          {s.tipsCents > 0 ? line(t(isClient ? 'session.tipSent' : 'session.tipReceived', { amount: '' }).replace(/[:\s]+$/, ''), fmt(s.tipsCents)) : null}
        </View>
        {canCancel && isClient ? (
          <Pressable accessibilityRole="button" onPress={() => setShowCancel(true)} style={[styles.card, styles.cancelRow, { backgroundColor: theme.surface }]}>
            <View style={[styles.cancelIcon, { backgroundColor: theme.bg }]}>
              <Ionicons name="close" size={18} color={theme.ink} />
            </View>
            <Text style={[styles.cancelText, { color: theme.text }]}>{t('bookings.cancel')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.muted} />
          </Pressable>
        ) : null}
      {s.review ? (
        <Card>
          <Body muted>{t('session.rating')}</Body>
          <Body>{stars(s.review.rating)}</Body>
          {s.review.body ? <Body muted>{s.review.body}</Body> : null}
        </Card>
      ) : null}
      {canReview ? (
        <Card>
          <ReviewForm bookingId={s.id} authorId={me} sellerId={s.seller_id} onDone={() => setReloadKey((k) => k + 1)} />
        </Card>
      ) : null}

      {note ? <Body muted>{note}</Body> : null}
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}

      <Button title={t('session.print')} variant="ghost" onPress={() => void printSummary(t('session.summaryTitle'), summaryLines())} />

      {isClient ? (
        <>
          <Spacer size={8} />
          {s.requests.length > 0 ? (
            <Body muted>{s.requests.map((r) => `${t(`session.kind.${r.kind}`)}: ${t(`session.requestStatus.${r.status}`)}`).join(' · ')}</Body>
          ) : null}
          {showRequest ? (
            <Card>
              <ChipRow>
                <Chip label={t('session.kind.receipt')} selected={invoiceKind === 'receipt'} onPress={() => setInvoiceKind('receipt')} />
                <Chip label={t('session.kind.invoice')} selected={invoiceKind === 'invoice'} onPress={() => setInvoiceKind('invoice')} />
              </ChipRow>
              <TextField label={t('session.requestDetails')} value={details} onChangeText={setDetails} multiline maxLength={1000} hint={t('session.requestHint')} />
              <Button title={t('session.sendRequest')} onPress={() => void sendRequest()} loading={busy} />
            </Card>
          ) : (
            <Button title={t('session.requestInvoice')} variant="ghost" onPress={() => setShowRequest(true)} />
          )}
        </>
      ) : null}

      {canTip ? (
        <>
          <Spacer size={8} />
          {tipPayment ? (
            <Card>
              <Body>{t('session.tipPay', { amount: fmt(tipPayment.amount_cents) })}</Body>
              <PaymentForm
                clientSecret={tipPayment.client_secret}
                stripeAccount={tipPayment.stripe_account}
                onPaid={() => {
                  setTipPayment(null);
                  setShowTip(false);
                  setNote(t('session.tipThanks'));
                  setReloadKey((k) => k + 1);
                }}
              />
            </Card>
          ) : showTip ? (
            <Card>
              <Body>{t('session.tipChoose')}</Body>
              <ChipRow>
                {TIPS.map((c) => (
                  <Chip key={c} label={fmt(c)} selected={tipChoice === c} onPress={() => setTipChoice(c)} />
                ))}
                <Chip label={t('session.tipOther')} selected={tipChoice === 'custom'} onPress={() => setTipChoice('custom')} />
              </ChipRow>
              {tipChoice === 'custom' ? <TextField label={t('session.tipCustom')} value={customTip} onChangeText={setCustomTip} keyboardType="decimal-pad" hint={t('session.tipRange')} /> : null}
              <Body muted>{t('session.tipNoFee')}</Body>
              <Spacer size={8} />
              <Button title={t('session.tipContinue')} onPress={() => void startTip()} loading={busy} />
            </Card>
          ) : (
            <Button title={t('session.addTip')} variant="ghost" onPress={() => setShowTip(true)} />
          )}
        </>
      ) : null}

      <Spacer size={8} />
      <Button title={`${t('session.report')} · ${t('session.soon')}`} variant="ghost" onPress={() => setNote(t('session.soonNote'))} />
      <Spacer size={8} />
      <Button title={`${t('session.support')} · ${t('session.soon')}`} variant="ghost" onPress={() => setNote(t('session.soonNote'))} />
      </View>
      {showCancel ? (
        <CancelSheet
          who={{ id: s.id, title: s.service_title, startsAt: s.starts_at, otherName: other.full_name, otherAvatar: other.avatar_path, otherSeed: other.id }}
          serviceId={s.service_id}
          sellerId={s.seller_id}
          paidCents={s.paid ? paidByClient : 0}
          onClose={() => setShowCancel(false)}
          onCancelled={(r) => {
            setShowCancel(false);
            setCancelled(r);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { margin: 8, padding: 18, paddingTop: 20, borderRadius: 40, gap: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  statusTag: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' },
  statusText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 13 },
  heroMid: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 32, letterSpacing: -1.4 },
  heroSub: { fontFamily: fonts.medium, fontSize: 14 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12 },
  tileSmall: { fontFamily: fonts.medium, fontSize: 11 },
  tileBig: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  body: { paddingHorizontal: 16, gap: 10 },
  desc: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  card: { borderRadius: 28, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineText: { fontSize: 15 },
  cancelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cancelText: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  doneWrap: { flex: 1, padding: 8, paddingBottom: 24, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },
  donePanel: { borderRadius: 40, padding: 22, paddingTop: 56, gap: 22 },
  okIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: fonts.semibold, fontSize: 38, lineHeight: 38, letterSpacing: -1.7 },
  doneBody: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  refundBox: { borderRadius: 28, padding: 16, flexDirection: 'row', alignItems: 'flex-end' },
  refundTitle: { fontFamily: fonts.semibold, fontSize: 14 },
  refundSub: { fontFamily: fonts.medium, fontSize: 13 },
  refundBig: { fontFamily: fonts.semibold, fontSize: 40, letterSpacing: -2 },
  moveCard: { borderRadius: 32, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  moveTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  moveSub: { fontFamily: fonts.regular, fontSize: 13 },
  moveBtn: { height: 42, paddingHorizontal: 16, borderRadius: 21, justifyContent: 'center' },
  moveBtnText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 14 },
  backBtn: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  backBtnText: { fontFamily: fonts.semibold, fontSize: 16 },
});
