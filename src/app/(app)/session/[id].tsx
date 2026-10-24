import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PaymentForm } from '@/components/PaymentForm';
import { ReviewForm } from '@/components/ReviewForm';
import { Body, Button, Card, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
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

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const s = await loadSession(id);
      if (alive) setData(s ?? 'missing');
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

  return (
    <Screen>
      <Title>{s.service_title}</Title>
      {s.packagePosition ? <Body muted>{t('session.packageOf', { index: s.packagePosition.index, total: s.packagePosition.total })}</Body> : null}
      {s.description ? <Body muted>{s.description}</Body> : null}
      <Spacer />
      <Card>
        <Body>{when}</Body>
        <Body muted>
          {minutes} min · {placeText}
        </Body>
        <Body muted>{t(`bookings.status.${s.status}`)}</Body>
      </Card>

      <Card>
        <Body muted>{t('session.seller')}</Body>
        <Body>{s.seller.full_name}</Body>
        {s.seller.handle ? <Button title={t('explore.viewProfile')} variant="ghost" onPress={() => openPerson(s.seller.handle)} /> : null}
        <Spacer size={8} />
        <Body muted>{t('session.client')}</Body>
        <Body>{s.client.full_name}</Body>
        {s.client.handle ? <Button title={t('explore.viewProfile')} variant="ghost" onPress={() => openPerson(s.client.handle)} /> : null}
      </Card>

      <Card>
        {isClient ? (
          <>
            <Body muted>{t('session.amountPaid')}</Body>
            <Body>{s.paid ? fmt(paidByClient) : t('session.notPaid')}</Body>
            <Body muted>
              {t('session.breakdown', { price: fmt(s.price_cents), extra: fmt(s.extra_cents), fee: fmt(s.client_fee_cents) })}
            </Body>
          </>
        ) : (
          <>
            <Body muted>{t('session.sellerNet')}</Body>
            <Body>{fmt(sellerNet)}</Body>
            <Body muted>{t('session.sellerBreakdown', { price: fmt(s.price_cents + s.extra_cents), fee: fmt(s.seller_fee_cents), paid: fmt(paidByClient) })}</Body>
          </>
        )}
        {s.refund_cents > 0 ? <Body muted>{t('bookings.refunded', { amount: fmt(s.refund_cents) })}</Body> : null}
        {s.tipsCents > 0 ? <Body muted>{t(isClient ? 'session.tipSent' : 'session.tipReceived', { amount: fmt(s.tipsCents) })}</Body> : null}
      </Card>

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
      <Spacer />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />
    </Screen>
  );
}
