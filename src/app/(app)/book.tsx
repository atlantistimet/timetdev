import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { PaymentForm } from '@/components/PaymentForm';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { ServiceHero } from '@/components/ServiceHero';
import { TierLines } from '@/components/TierLines';
import { ActionBar, Body, Button, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { loadCategories, loadSellerStats, loadSellers, type Seller } from '@/lib/explore';
import { fonts, pastelFor, radius, useTheme } from '@/theme';
import {
  createBookingPayment,
  createPackagePayment,
  cleanTitle,
  formatEuro,
  loadExactSlot,
  loadLinkSlots,
  loadOpenSlots,
  loadSellerPlace,
  loadLinkService,
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

type Loaded = { service: SlotService; offer: Offer | null; link: SlotLink | null; slots: OpenSlot[]; tiers: Tier[]; sellerPlace: SellerPlace; photos: MediaItem[]; seller: Seller | null; rating: number | null; emoji: string | null } | 'missing';

export default function BookScreen() {
  const { t, i18n } = useTranslation();
  const { serviceId, offerId, code, instant } = useLocalSearchParams<{ serviceId?: string; offerId?: string; code?: string; instant?: string }>();
  const isInstant = instant === '1' && !code;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]); // pacchetto: inizi (ISO) delle sessioni scelte
  const [place, setPlace] = useState<Place | null>(null);
  const [address, setAddress] = useState('');
  const [starting, setStarting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentIntentInfo | null>(null);
  const [paid, setPaid] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    let active = true;
    (async () => {
      // da link "Slot singolo" (codice) oppure da servizio/offerta
      const link = code ? await loadLinkByCode(code) : null;
      const linkServiceId = link?.service_id ?? null;
      const service = code ? (linkServiceId ? await loadLinkService(code) : null) : serviceId ? await loadSlotService(serviceId) : null;
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
        const [tiers, sellerPlace, photos, sellers, stats, categories] = await Promise.all([
          offer?.cancel_tiers ? Promise.resolve(offer.cancel_tiers) : loadServiceTiers(service.seller_id, service.cancel_tiers),
          loadSellerPlace(service.seller_id),
          listPhotos(service.id).then((list) => list.map((x) => ({ path: x.path, type: x.type }))),
          loadSellers([service.seller_id]),
          loadSellerStats([service.seller_id]),
          loadCategories(i18n.language),
        ]);
        const seller = sellers[service.seller_id] ?? null;
        const emoji = categories.find((c) => c.key === seller?.categories[0])?.emoji ?? null;
        result = { service, offer, link, slots, tiers, sellerPlace, photos, seller, rating: stats[service.seller_id]?.rating_avg ?? null, emoji };
      }
      if (active) setLoaded(result);
    })();
    return () => {
      active = false;
    };
  }, [serviceId, offerId, code, i18n.language]);

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

  const { service, offer, link, slots, tiers, sellerPlace, photos, seller, rating, emoji } = loaded;
  // sede solo se il venditore ha indicato l'indirizzo (stessa regola del server)
  const places = service.places.filter((p) => (!link || link.places.includes(p)) && (p !== 'sede' || !!sellerPlace.place_address));
  const chosen: Place | null = place && places.includes(place) ? place : places.length === 1 ? places[0] : null;
  const extraCents = link
    ? chosen === 'domicilio' ? link.extra_travel_cents : chosen === 'sede' ? link.extra_space_cents : 0
    : chosen === 'domicilio' ? sellerPlace.travel_fee_cents : chosen === 'sede' ? service.space_fee_cents : 0;
  const priceCents = link ? discountedCents(link.price_cents, link.discount_pct) : offer ? finalPriceCents(offer) : service.price_cents;
  const durationMin = link?.duration_min ?? offer?.duration_min ?? service.duration_min;
  const discountPct = (link ?? offer)?.discount_pct ?? 0;
  const baseCents = link ? link.price_cents : offer ? offer.price_cents : service.price_cents;
  const isPackage = service.kind === 'package';
  const sessions = service.sessions ?? 1;
  const pickedMs = picked.map((iso) => new Date(iso).getTime()).sort((a, b) => a - b);
  const clashes = (iso: string) => {
    const ms = new Date(iso).getTime();
    return pickedMs.some((p) => ms < p + durationMin * 60_000 && p < ms + durationMin * 60_000);
  };
  const togglePicked = (iso: string) =>
    setPicked((cur) => (cur.includes(iso) ? cur.filter((x) => x !== iso) : cur.length >= sessions || clashes(iso) ? cur : [...cur, iso]));

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

  const startInstant = async () => {
    if (!chosen) return;
    if (chosen === 'domicilio' && !address.trim()) return setErrorKey('book.errors.address_required');
    setStarting(true);
    setErrorKey(null);
    const result = await createBookingPayment({ serviceId: service.id, startsAt: new Date().toISOString(), place: chosen, clientAddress: chosen === 'domicilio' ? address.trim() : undefined, offerId: offer?.id, instant: true });
    setStarting(false);
    if (result.payment) setPayment(result.payment);
    else setErrorKey(result.errorKey);
  };

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const byDay = new Map<string, OpenSlot[]>();
  for (const slot of slots) {
    const k = dayKey(new Date(slot.starts_at));
    byDay.set(k, [...(byDay.get(k) ?? []), slot]);
  }
  const strip = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });
  const activeDay = day ?? strip.map(dayKey).find((k) => byDay.has(k)) ?? null;
  const daySlots = activeDay ? byDay.get(activeDay) ?? [] : [];
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const timeFmt = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const shortFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric' });
  const chosenSlot = slots.find((s) => s.id === slotId) ?? null;
  const placeTag = places.length === 1 ? t(`places.${places[0]}`) : null;
  const tag = [`${durationMin} min`, placeTag].filter(Boolean).join(' · ');
  const totalCents = priceCents + extraCents * (isPackage ? sessions : 1);
  const ready = !!chosen && (isInstant ? true : isPackage ? picked.length === sessions : !!chosenSlot);
  const caption = isInstant
    ? t('book.instantCaption')
    : isPackage
      ? t('book.pickSlots', { picked: picked.length, count: sessions })
      : chosenSlot
        ? `${shortFmt.format(new Date(chosenSlot.starts_at))} · ${timeFmt.format(new Date(chosenSlot.starts_at))}`
        : t('book.chooseWhen');
  const go = () => void (isInstant ? startInstant() : isPackage ? startPackage() : start());
  const heroPhoto = photos.find((x) => x.type === 'image');
  const heroImage = link?.preview_path && link.preview_type === 'image' ? { path: link.preview_path, bucket: 'media' as const } : heroPhoto ? { path: heroPhoto.path, bucket: 'service-media' as const } : null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/services'));

  if (paid) {
    const when = payment ? (isInstant ? null : isPackage ? (pickedMs[0] ?? null) : chosenSlot ? new Date(chosenSlot.starts_at).getTime() : null) : null;
    const whenDate = when ? new Date(when) : null;
    const firstName = (seller?.full_name ?? '').split(' ')[0];
    const dayName = whenDate ? new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(whenDate) : null;
    return (
      <Screen bare>
        <View style={[styles.doneWrap]}>
          <View style={[styles.donePanel, { backgroundColor: theme.accent }]}>
            <View style={styles.doneFaces}>
              <Emoji name="party_popper" size={72} />
              <Avatar name={seller?.full_name ?? '?'} seed={service.seller_id} size={72} round={26} path={seller?.avatar_path} />
            </View>
            <Text style={[styles.doneTitle, { color: theme.onAccent }]}>
              {dayName ? t('book.doneTitle', { day: dayName }) : t('book.doneTitleInstant')}
            </Text>
            <View style={styles.tiles}>
              <View style={[styles.tileBox, { backgroundColor: theme.ink }]}>
                <Text style={[styles.tileSmall, { color: theme.inkMuted }]}>{whenDate ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' }).format(whenDate) : t('book.instantCaption')}</Text>
                <Text style={[styles.tileBig, { color: theme.accent }]}>{whenDate ? timeFmt.format(whenDate) : `${durationMin}'`}</Text>
              </View>
              <View style={[styles.tileBox, { backgroundColor: 'rgba(255,255,255,0.55)' }]}>
                <Text style={[styles.tileSmall, { color: theme.onAccent }]}>{[chosen ? t(`places.${chosen}`) : null, `${durationMin} min`].filter(Boolean).join(' · ')}</Text>
                <Text style={[styles.tileBig, { color: theme.onAccent }]}>{payment ? formatEuro(payment.amount_cents, i18n.language) : ''}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.doneCard, { backgroundColor: theme.surface }]}>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/sessions')} style={styles.doneRow}>
              <Emoji name="calendar" size={32} />
              <Text style={[styles.doneRowText, { color: theme.text }]}>{t('book.doneAgenda')}</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace(`/chat/${service.seller_id}`)} style={[styles.doneRow, { borderTopWidth: 1, borderTopColor: theme.fill }]}>
              <Emoji name="speech_balloon" size={32} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.doneRowText, { color: theme.text }]}>{t('book.doneWrite', { name: firstName })}</Text>
                <Text style={[styles.doneRowSub, { color: theme.muted }]}>{t('book.doneWriteSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
          </View>
          <Text style={[styles.doneNote, { color: theme.muted }]}>{t('book.doneNote')}</Text>
          <View style={styles.doneButtons}>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/services')} style={[styles.doneBtn, { backgroundColor: theme.surface }]}>
              <Text style={[styles.doneBtnText, { color: theme.text }]}>{t('book.doneExplore')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/sessions')} style={[styles.doneBtn, { backgroundColor: theme.ink }]}>
              <Text style={[styles.doneBtnText, { color: '#FFFFFF' }]}>{t('book.doneSession')}</Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  if (payment) {
    const first: number | null = isInstant ? null : isPackage ? (pickedMs[0] ?? null) : chosenSlot ? new Date(chosenSlot.starts_at).getTime() : null;
    const feeCents = Math.max(0, payment.amount_cents - totalCents);
    const row = (label: string, value: string, strong?: boolean) => (
      <View style={[styles.sumRow, strong && { borderTopWidth: 1, borderTopColor: theme.fill }]}>
        <Text style={[strong ? styles.sumStrong : styles.sumText, { color: strong ? theme.text : theme.muted }]}>{label}</Text>
        <Text style={[strong ? styles.sumStrong : styles.sumText, { color: theme.text }]}>{value}</Text>
      </View>
    );
    return (
      <Screen>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => setPayment(null)} style={[styles.backWhite, { backgroundColor: theme.surface }]}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.checkoutTitle, { color: theme.text }]}>{t('book.confirmTitle')}</Text>
        <View style={[styles.panel, { backgroundColor: theme.surface }]}>
          <View style={styles.sumHead}>
            <Avatar name={seller?.full_name ?? '?'} seed={service.seller_id} size={56} round={20} path={seller?.avatar_path} />
            <View style={styles.sumHeadText}>
              <Text numberOfLines={2} style={[styles.sumTitle, { color: theme.text }]}>{cleanTitle(service.title)}</Text>
              <Text numberOfLines={1} style={[styles.sumSub, { color: theme.muted }]}>{[t('book.withSeller', { name: seller?.full_name ?? '' }), chosen ? t(`places.${chosen}`) : null].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <View style={styles.tiles}>
            <View style={[styles.tileBox, { backgroundColor: theme.accent }]}>
              <Text style={[styles.tileSmall, { color: theme.onAccent }]}>{first ? new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(first)) : ''}</Text>
              <Text style={[styles.tileBig, { color: theme.onAccent }]}>{first ? timeFmt.format(new Date(first)) : t('book.instantCaption')}</Text>
            </View>
            <View style={[styles.tileBox, { backgroundColor: theme.bg }]}>
              <Text style={[styles.tileSmall, { color: theme.muted }]}>{t('book.durationLabel')}</Text>
              <Text style={[styles.tileBig, { color: theme.text }]}>{`${durationMin}'`}</Text>
            </View>
          </View>
          <View style={[styles.sumBox, { borderTopColor: theme.fill }]}>
            {row(isPackage ? t('book.packageShort', { count: sessions }) : t('book.session'), formatEuro(priceCents, i18n.language))}
            {extraCents > 0 ? row(t(chosen === 'domicilio' ? 'book.travelRow' : 'book.spaceRow'), formatEuro(extraCents * (isPackage ? sessions : 1), i18n.language)) : null}
            {feeCents > 0 ? row(t('book.feeRow'), formatEuro(feeCents, i18n.language)) : null}
            {row(t('book.totalRow'), formatEuro(payment.amount_cents, i18n.language), true)}
          </View>
        </View>
        <View style={[styles.panel, { backgroundColor: theme.surface, padding: 12 }]}>
          <PaymentForm clientSecret={payment.client_secret} stripeAccount={payment.stripe_account} onPaid={() => setPaid(true)} onFailed={() => setDeclined(true)} />
        </View>
        <View style={styles.note}>
          <Emoji name="raising_hands" size={24} />
          <Text style={[styles.noteText, { color: theme.muted }]}>{t('book.noteCancel')}</Text>
        </View>
        <TierLines tiers={tiers} />
        <SheetModal  visible={declined} onRequestClose={() => setDeclined(false)}>
          <View style={[styles.scrim]}>
            <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
              <View style={[styles.grabber, { backgroundColor: theme.fill }]} />
              <View style={[styles.alertIcon, { backgroundColor: '#FEE4E2' }]}>
                <Ionicons name="card-outline" size={30} color={theme.danger} />
              </View>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('book.declinedTitle')}</Text>
              <Text style={[styles.sheetBody, { color: theme.muted }]}>{t('book.declinedBody')}</Text>
              <View style={[styles.holdNote, { backgroundColor: theme.bg }]}>
                <Emoji name="stopwatch" size={22} />
                <Text style={[styles.holdText, { color: theme.text }]}>{t('book.declinedHold')}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setDeclined(false)} style={[styles.sheetBtn, { backgroundColor: theme.ink }]}>
                <Text style={[styles.sheetBtnText, { color: '#FFFFFF' }]}>{t('book.declinedOther')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setDeclined(false)} style={[styles.sheetBtn, styles.sheetBtnSmall, { backgroundColor: theme.bg }]}>
                <Text style={[styles.sheetBtnText, { color: theme.text, fontSize: 15 }]}>{t('book.declinedRetry')}</Text>
              </Pressable>
            </View>
          </View>
        </SheetModal>
      </Screen>
    );
  }

  return (
    <Screen
      bare
      footer={
        <ActionBar
          label={formatEuro(totalCents, i18n.language)}
          oldLabel={discountPct ? formatEuro(baseCents + extraCents * (isPackage ? sessions : 1), i18n.language) : undefined}
          badge={discountPct ? `−${discountPct}%` : undefined}
          caption={caption}
          actionTitle={t('book.reserve')}
          onAction={go}
          loading={starting}
          disabled={!ready}
        />
      }>
      <ServiceHero
        color={pastelFor(service.id)}
        emoji={emoji}
        title={service.title}
        sellerId={service.seller_id}
        sellerName={seller?.full_name ?? ''}
        sellerPath={seller?.avatar_path}
        rating={rating ? Number(rating) : null}
        tag={tag}
        onBack={goBack}
        backLabel={t('common.back')}
        imagePath={heroImage?.path}
        imageBucket={heroImage?.bucket}
      />
      <View style={styles.body}>
        {(link ?? offer)?.message ? <Body muted>{(link ?? offer)?.message}</Body> : null}

        {service.description ? <Text style={[styles.desc, { color: theme.text }]}>{service.description}</Text> : null}
        {service.includes.length > 0 ? (
          <View style={styles.pills}>
            {service.includes.map((line) => (
              <View key={line} style={[styles.includePill, { backgroundColor: theme.surface }]}>
                <Emoji name="sparkles" size={20} />
                <Text style={[styles.includeText, { color: theme.text }]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {places.length > 1 ? (
          <>
            <Text style={[styles.h2, { color: theme.text }]}>{t('book.where')}</Text>
            <View style={styles.pills}>
              {places.map((p) => (
                <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: chosen === p }} onPress={() => setPlace(p)} style={[styles.placePill, { backgroundColor: chosen === p ? theme.ink : theme.surface }]}>
                  <Text style={[styles.includeText, { color: chosen === p ? theme.inkOn : theme.text }]}>{t(`places.${p}`)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        {chosen === 'sede' ? <Body muted>{t('book.sedeAt', { address: sellerPlace.place_address })}</Body> : null}
        {chosen === 'domicilio' ? (
          <>
            {sellerPlace.service_area ? <Body muted>{t('book.area', { area: sellerPlace.service_area })}</Body> : null}
            <TextField label={t('book.address')} value={address} onChangeText={setAddress} maxLength={200} hint={t('book.addressHint')} />
          </>
        ) : null}
        {extraCents > 0 ? (
          <Body muted>
            {t(chosen === 'domicilio' ? 'book.extraTravel' : 'book.extraSpace', { amount: formatEuro(extraCents, i18n.language) })}
            {isPackage ? ` ${t('book.perSession')}` : ''}
          </Body>
        ) : null}

        {isInstant ? (
          <Body muted>{t('book.instantHint', { minutes: durationMin })}</Body>
        ) : (
          <>
            <Text style={[styles.h2, { color: theme.text }]}>{isPackage ? t('book.pickSlots', { picked: picked.length, count: sessions }) : t('book.when')}</Text>
            {slots.length === 0 ? <Body muted>{t('book.noSlots')}</Body> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {strip.map((d) => {
                const k = dayKey(d);
                const has = byDay.has(k);
                const on = k === activeDay;
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !has }}
                    disabled={!has}
                    onPress={() => setDay(k)}
                    style={[styles.dayTile, has ? { backgroundColor: on ? theme.ink : theme.surface } : styles.dayOff]}>
                    <Text style={[styles.dayName, { color: on ? theme.inkMuted : has ? theme.muted : '#9A9A94' }]}>{weekday.format(d)}</Text>
                    <Text style={[styles.dayNum, { color: on ? theme.inkOn : has ? theme.text : '#9A9A94' }]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.times}>
              {daySlots.map((slot) => {
                const on = isPackage ? picked.includes(slot.starts_at) : slot.id === slotId;
                return (
                  <View key={slot.id} style={styles.timeCell}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => (isPackage ? togglePicked(slot.starts_at) : setSlotId(slot.id))}
                      style={[styles.time, { backgroundColor: on ? theme.accent : theme.surface }, on && { borderWidth: 2, borderColor: theme.ink }]}>
                      <Text style={[styles.timeText, { color: on ? theme.onAccent : theme.text }]}>{timeFmt.format(new Date(slot.starts_at))}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.h2, { color: theme.text }]}>{t('policy.cancelRules')}</Text>
        <View style={[styles.cancel, { backgroundColor: theme.surface }]}>
          <TierLines tiers={tiers} />
        </View>
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneWrap: { flex: 1, padding: 8, paddingBottom: 16, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' },
  donePanel: { borderRadius: 40, padding: 22, paddingTop: 56, gap: 20 },
  doneFaces: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  doneTitle: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 46, letterSpacing: -1.6 },
  doneCard: { borderRadius: 32, overflow: 'hidden' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 16 },
  doneRowText: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2 },
  doneRowSub: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },
  doneNote: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 20 },
  doneButtons: { flexDirection: 'row', gap: 10 },
  doneBtn: { flex: 1, height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontFamily: fonts.semibold, fontSize: 16 },
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 24, paddingBottom: 32, gap: 14, alignItems: 'stretch', maxWidth: 480, width: '100%', alignSelf: 'center' },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },
  alertIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 31, letterSpacing: -0.9 },
  sheetBody: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  holdNote: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, padding: 14 },
  holdText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  sheetBtn: { height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sheetBtnSmall: { height: 52 },
  sheetBtnText: { fontFamily: fonts.semibold, fontSize: 16 },
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  desc: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  h2: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.45, marginTop: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  includePill: { height: 34, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  includeText: { fontFamily: fonts.medium, fontSize: 14 },
  placePill: { height: 42, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 18 },
  priceMain: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexShrink: 1 },
  priceOld: { fontFamily: fonts.medium, fontSize: 16, textDecorationLine: 'line-through' },
  priceNow: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.5 },
  discount: { height: 32, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  discountText: { fontFamily: fonts.semibold, fontSize: 15 },
  days: { gap: 6 },
  dayTile: { width: 66, height: 70, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  dayOff: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C8C2' },
  dayName: { fontFamily: fonts.medium, fontSize: 12 },
  dayNum: { fontFamily: fonts.semibold, fontSize: 22 },
  times: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  timeCell: { width: '25%', padding: 3 },
  time: { height: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontFamily: fonts.semibold, fontSize: 16 },
  cancel: { borderRadius: radius.card, padding: 16 },
  backWhite: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  checkoutTitle: { fontFamily: fonts.semibold, fontSize: 36, lineHeight: 37, letterSpacing: -1.45, marginBottom: 14 },
  panel: { borderRadius: 32, padding: 16, gap: 14, marginBottom: 14 },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sumHeadText: { flex: 1 },
  sumTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  sumSub: { fontFamily: fonts.medium, fontSize: 14 },
  tiles: { flexDirection: 'row', gap: 8 },
  tileBox: { flex: 1, borderRadius: radius.tile, paddingVertical: 12, paddingHorizontal: 14 },
  tileSmall: { fontFamily: fonts.medium, fontSize: 12 },
  tileBig: { fontFamily: fonts.semibold, fontSize: 32, letterSpacing: -1.3 },
  sumBox: { borderTopWidth: 1 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  sumText: { fontFamily: fonts.medium, fontSize: 15 },
  sumStrong: { fontFamily: fonts.semibold, fontSize: 17 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, marginBottom: 8 },
  noteText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
});
