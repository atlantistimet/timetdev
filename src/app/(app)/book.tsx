import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MediaGallery } from '@/components/MediaView';
import { PaymentForm } from '@/components/PaymentForm';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import {
  createBookingPayment,
  createPackagePayment,
  formatEuro,
  loadExactSlot,
  loadLinkSlots,
  loadOpenSlots,
  loadSellerPlace,
  loadSlotService,
  type OpenSlot,
  type PaymentIntentInfo,
  type SellerPlace,
  type SlotService,
} from '@/lib/booking';
import { discountedCents, offerApplies, type Validity } from '@/lib/validity';
import { loadLinkByCode, type SlotLink } from '@/lib/slot-links';
import { finalPriceCents, loadOffer, type Offer } from '@/lib/offers';
import { loadServiceTiers, type Tier } from '@/lib/cancel-policy';
import { type MediaItem } from '@/lib/media';
import { listPhotos } from '@/lib/service-media';
import { type Place } from '@/lib/my-services';

type Loaded = { service: SlotService; offer: Offer | null; link: SlotLink | null; slots: OpenSlot[]; tiers: Tier[]; sellerPlace: SellerPlace; photos: MediaItem[] } | 'missing';

export default function BookScreen() {
  const { t, i18n } = useTranslation();
  const { serviceId, offerId, code } = useLocalSearchParams<{ serviceId?: string; offerId?: string; code?: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]); // pacchetto: inizi (ISO) delle sessioni scelte
  const [place, setPlace] = useState<Place | null>(null);
  const [address, setAddress] = useState('');
  const [starting, setStarting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentIntentInfo | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // da link "Invia slot" (codice) oppure da servizio/offerta
      const link = code ? await loadLinkByCode(code) : null;
      const linkServiceId = link?.service_id ?? null;
      const service = code ? (linkServiceId ? await loadSlotService(linkServiceId) : null) : serviceId ? await loadSlotService(serviceId) : null;
      const found = offerId && !code ? await loadOffer(offerId) : null;
      const offer = found && found.active && found.service_id === service?.id ? found : null;
      let result: Loaded = 'missing';
      if (service && !(offerId && !code && !offer) && !(code && !link)) {
        const durationMin = link?.duration_min ?? offer?.duration_min ?? service.duration_min;
        const exact = link?.starts_at ?? null;
        const open = exact
          ? await loadExactSlot(service.seller_id, exact, durationMin)
          : link
            ? await loadLinkSlots(service.seller_id, link.days, link.ranges, durationMin)
            : await loadOpenSlots(service.seller_id, service.id, offer?.id ?? null, durationMin);
        // l'offerta può restringere a date precise ("giorni"); il resto della sua disponibilità lo calcola il database
        const validity: Validity | null = link ? null : offer?.validity ?? null;
        const slots = validity && !exact
          ? open.filter((s) => offerApplies(validity, new Date(s.starts_at), new Date(new Date(s.starts_at).getTime() + durationMin * 60_000)))
          : open;
        const [tiers, sellerPlace, photos] = await Promise.all([
          offer?.cancel_tiers ? Promise.resolve(offer.cancel_tiers) : loadServiceTiers(service.seller_id, service.cancel_tiers),
          loadSellerPlace(service.seller_id),
          listPhotos(service.id).then((list) => list.map((x) => ({ path: x.path, type: x.type }))),
        ]);
        result = { service, offer, link, slots, tiers, sellerPlace, photos };
      }
      if (active) setLoaded(result);
    })();
    return () => {
      active = false;
    };
  }, [serviceId, offerId, code]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('book.title')}</Title>
        <ErrorText>{t(code ? 'book.errors.link_not_found' : 'book.errors.service_not_found')}</ErrorText>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }

  const { service, offer, link, slots, tiers, sellerPlace, photos } = loaded;
  // sede solo se il venditore ha indicato l'indirizzo (stessa regola del server)
  const places = service.places.filter((p) => (!link || link.places.includes(p)) && (p !== 'sede' || !!sellerPlace.place_address));
  const chosen: Place | null = place && places.includes(place) ? place : places.length === 1 ? places[0] : null;
  const extraCents = link
    ? chosen === 'domicilio' ? link.extra_travel_cents : chosen === 'sede' ? link.extra_space_cents : 0
    : chosen === 'domicilio' ? sellerPlace.travel_fee_cents : chosen === 'sede' ? service.space_fee_cents : 0;
  const priceCents = link ? discountedCents(link.price_cents, link.discount_pct) : offer ? finalPriceCents(offer) : service.price_cents;
  const durationMin = link?.duration_min ?? offer?.duration_min ?? service.duration_min;
  const isPackage = service.kind === 'package';
  const sessions = service.sessions ?? 1;
  const pickedMs = picked.map((iso) => new Date(iso).getTime()).sort((a, b) => a - b);
  const clashes = (iso: string) => {
    const ms = new Date(iso).getTime();
    return pickedMs.some((p) => ms < p + durationMin * 60_000 && p < ms + durationMin * 60_000);
  };
  const togglePicked = (iso: string) =>
    setPicked((cur) => (cur.includes(iso) ? cur.filter((x) => x !== iso) : cur.length >= sessions || clashes(iso) ? cur : [...cur, iso]));
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' });

  const startPackage = async () => {
    if (!chosen || picked.length !== sessions) return;
    if (chosen === 'domicilio' && !address.trim()) return setErrorKey('book.errors.address_required');
    setStarting(true);
    setErrorKey(null);
    const result = await createPackagePayment({ serviceId: service.id, startsAt: picked, place: chosen, clientAddress: chosen === 'domicilio' ? address.trim() : undefined });
    setStarting(false);
    if (result.payment) setPayment({ booking_id: '', ...result.payment });
    else setErrorKey(result.errorKey);
  };

  const start = async () => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !chosen) return;
    if (chosen === 'domicilio' && !address.trim()) return setErrorKey('book.errors.address_required');
    setStarting(true);
    setErrorKey(null);
    const result = await createBookingPayment({ serviceId: link ? undefined : service.id, code: link?.code, startsAt: slot.starts_at, place: chosen, clientAddress: chosen === 'domicilio' ? address.trim() : undefined, offerId: offer?.id });
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
      {link?.preview_path && link.preview_type ? <MediaGallery items={[{ path: link.preview_path, type: link.preview_type }]} bucket="media" /> : null}
      <MediaGallery items={photos} bucket="service-media" />
      <Title>{service.title}</Title>
      <Body muted>
        {isPackage
          ? t('book.packageLine', { count: sessions, minutes: durationMin, price: formatEuro(priceCents, i18n.language) })
          : `${(link ?? offer)?.discount_pct ? `−${(link ?? offer)?.discount_pct}% · ` : ''}${formatEuro(priceCents, i18n.language)} · ${durationMin} min`}
      </Body>
      {(link ?? offer)?.message ? <Body muted>{(link ?? offer)?.message}</Body> : null}
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
          {isPackage ? ` ${t('book.perSession')}` : ''}
          {' · '}
          {t('book.summaryTotal', { amount: formatEuro(priceCents + extraCents * (isPackage ? sessions : 1), i18n.language) })}
        </Body>
      ) : null}
      <Spacer />
      <Body>{isPackage ? t('book.pickSlots', { picked: picked.length, count: sessions }) : t('book.pickSlot')}</Body>
      <Spacer size={8} />
      {slots.length === 0 ? <Body muted>{t('book.noSlots')}</Body> : null}
      {slots.map((slot) => (
        <Button
          key={slot.id}
          title={dateFormat.format(new Date(slot.starts_at))}
          variant={(isPackage ? picked.includes(slot.starts_at) : slot.id === slotId) ? 'primary' : 'ghost'}
          onPress={() => (isPackage ? togglePicked(slot.starts_at) : setSlotId(slot.id))}
        />
      ))}
      <Spacer />
      <Body>{t('policy.cancelRules')}</Body>
      <TierLines tiers={tiers} />
      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {isPackage && chosen && picked.length === sessions ? <Button title={t('book.continue')} onPress={() => void startPackage()} loading={starting} /> : null}
      {!isPackage && slotId && chosen ? <Button title={t('book.continue')} onPress={() => void start()} loading={starting} /> : null}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
    </Screen>
  );
}
