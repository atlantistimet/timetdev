import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PhotoStrip } from '@/components/PhotosSection';
import { PaymentForm } from '@/components/PaymentForm';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import {
  createBookingPayment,
  formatEuro,
  loadOpenSlots,
  loadSellerPlace,
  loadSlotService,
  type OpenSlot,
  type PaymentIntentInfo,
  type SellerPlace,
  type SlotService,
} from '@/lib/booking';
import { offerApplies } from '@/lib/validity';
import { finalPriceCents, loadOffer, type Offer } from '@/lib/offers';
import { loadServiceTiers, type Tier } from '@/lib/cancel-policy';
import { listPhotos } from '@/lib/service-media';
import { type Place } from '@/lib/my-services';

type Loaded = { service: SlotService; offer: Offer | null; slots: OpenSlot[]; tiers: Tier[]; sellerPlace: SellerPlace; photos: string[] } | 'missing';

export default function BookScreen() {
  const { t, i18n } = useTranslation();
  const { serviceId, offerId } = useLocalSearchParams<{ serviceId: string; offerId?: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [address, setAddress] = useState('');
  const [starting, setStarting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentIntentInfo | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const service = serviceId ? await loadSlotService(serviceId) : null;
      const found = offerId ? await loadOffer(offerId) : null;
      const offer = found && found.active && found.service_id === service?.id ? found : null;
      let result: Loaded = 'missing';
      if (service && !(offerId && !offer)) {
        const durationMin = offer?.duration_min ?? service.duration_min;
        const open = await loadOpenSlots(service.seller_id, durationMin);
        // con un'offerta si mostrano solo gli orari che rientrano nella sua validità
        const slots = offer
          ? open.filter((s) => offerApplies(offer.validity, new Date(s.starts_at), new Date(new Date(s.starts_at).getTime() + durationMin * 60_000)))
          : open;
        const [tiers, sellerPlace, photos] = await Promise.all([
          offer?.cancel_tiers ? Promise.resolve(offer.cancel_tiers) : loadServiceTiers(service.seller_id, service.cancel_tiers),
          loadSellerPlace(service.seller_id),
          listPhotos(service.id).then((list) => list.map((x) => x.path)),
        ]);
        result = { service, offer, slots, tiers, sellerPlace, photos };
      }
      if (active) setLoaded(result);
    })();
    return () => {
      active = false;
    };
  }, [serviceId, offerId]);

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

  const { service, offer, slots, tiers, sellerPlace, photos } = loaded;
  // sede solo se il venditore ha indicato l'indirizzo (stessa regola del server)
  const places = service.places.filter((p) => p !== 'sede' || !!sellerPlace.place_address);
  const chosen: Place | null = place && places.includes(place) ? place : places.length === 1 ? places[0] : null;
  const extraCents = chosen === 'domicilio' ? sellerPlace.travel_fee_cents : chosen === 'sede' ? service.space_fee_cents : 0;
  const priceCents = offer ? finalPriceCents(offer) : service.price_cents;
  const durationMin = offer?.duration_min ?? service.duration_min;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' });

  const start = async () => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !chosen) return;
    if (chosen === 'domicilio' && !address.trim()) return setErrorKey('book.errors.address_required');
    setStarting(true);
    setErrorKey(null);
    const result = await createBookingPayment({ serviceId: service.id, startsAt: slot.starts_at, place: chosen, clientAddress: chosen === 'domicilio' ? address.trim() : undefined, offerId: offer?.id });
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
      <PhotoStrip paths={photos} />
      <Title>{service.title}</Title>
      <Body muted>
        {offer && offer.discount_pct ? `−${offer.discount_pct}% · ` : ''}
        {formatEuro(priceCents, i18n.language)} · {durationMin} min
      </Body>
      {offer?.message ? <Body muted>{offer.message}</Body> : null}
      {service.includes.length > 0 ? (
        <>
          <Spacer size={8} />
          <Body>{t('book.includesTitle')}</Body>
          {service.includes.map((line) => (
            <Body key={line} muted>
              • {line}
            </Body>
          ))}
        </>
      ) : null}
      <Spacer />
      <Body>{t('book.where')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {places.map((p) => (
          <Chip key={p} label={t(`places.${p}`)} selected={chosen === p} onPress={() => setPlace(p)} />
        ))}
      </ChipRow>
      {chosen === 'sede' ? <Body muted>{t('book.sedeAt', { address: sellerPlace.place_address })}</Body> : null}
      {chosen === 'domicilio' ? (
        <>
          {sellerPlace.service_area ? <Body muted>{t('book.area', { area: sellerPlace.service_area })}</Body> : null}
          <Spacer size={8} />
          <TextField label={t('book.address')} value={address} onChangeText={setAddress} maxLength={200} hint={t('book.addressHint')} />
        </>
      ) : null}
      {extraCents > 0 ? (
        <Body muted>
          {t(chosen === 'domicilio' ? 'book.extraTravel' : 'book.extraSpace', { amount: formatEuro(extraCents, i18n.language) })}
          {' · '}
          {t('book.summaryTotal', { amount: formatEuro(priceCents + extraCents, i18n.language) })}
        </Body>
      ) : null}
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
      <Body>{t('policy.cancelRules')}</Body>
      <TierLines tiers={tiers} />
      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {slotId && chosen ? <Button title={t('book.continue')} onPress={() => void start()} loading={starting} /> : null}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
    </Screen>
  );
}
