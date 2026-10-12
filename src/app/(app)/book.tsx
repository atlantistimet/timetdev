import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PaymentForm } from '@/components/PaymentForm';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import {
  createBookingPayment,
  formatEuro,
  loadOpenSlots,
  loadSlotService,
  type OpenSlot,
  type PaymentIntentInfo,
  type SlotService,
} from '@/lib/booking';

type Loaded = { service: SlotService; slots: OpenSlot[] } | 'missing';

export default function BookScreen() {
  const { t, i18n } = useTranslation();
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentIntentInfo | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const service = serviceId ? await loadSlotService(serviceId) : null;
      const result: Loaded = service ? { service, slots: await loadOpenSlots(service.seller_id, service.duration_min) } : 'missing';
      if (active) setLoaded(result);
    })();
    return () => {
      active = false;
    };
  }, [serviceId]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('book.title')}</Title>
        <ErrorText>{t('book.errors.service_not_found')}</ErrorText>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }

  const { service, slots } = loaded;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' });

  const start = async () => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    setStarting(true);
    setErrorKey(null);
    const result = await createBookingPayment({ serviceId: service.id, startsAt: slot.starts_at, place: 'online' });
    setStarting(false);
    if (result.payment) setPayment(result.payment);
    else setErrorKey(result.errorKey);
  };

  if (paid) {
    return (
      <Screen>
        <Title>{t('book.paidTitle')}</Title>
        <Body muted>{t('book.paidBody')}</Body>
        <Spacer />
        <Button title={t('common.back')} onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  if (payment) {
    return (
      <Screen>
        <Title>{t('book.payTitle')}</Title>
        <Body>{service.title}</Body>
        <Body muted>{t('book.total', { amount: formatEuro(payment.amount_cents, i18n.language) })}</Body>
        <Spacer />
        <PaymentForm clientSecret={payment.client_secret} stripeAccount={payment.stripe_account} onPaid={() => setPaid(true)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{service.title}</Title>
      <Body muted>
        {formatEuro(service.price_cents, i18n.language)} · {service.duration_min} min · {t('book.online')}
      </Body>
      <Spacer />
      <Body>{t('book.pickSlot')}</Body>
      <Spacer size={8} />
      {slots.length === 0 ? <Body muted>{t('book.noSlots')}</Body> : null}
      {slots.map((slot) => (
        <Button
          key={slot.id}
          title={dateFormat.format(new Date(slot.starts_at))}
          variant={slot.id === slotId ? 'primary' : 'ghost'}
          onPress={() => setSlotId(slot.id)}
        />
      ))}
      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {slotId ? <Button title={t('book.continue')} onPress={() => void start()} loading={starting} /> : null}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
    </Screen>
  );
}
