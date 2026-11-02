import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Emoji } from '@/components/Emoji';
import { MediaPicker } from '@/components/MediaView';
import { NewServiceFields } from '@/components/NewServiceFields';
import { PolicySection } from '@/components/PolicySection';
import { fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { Checkbox, Chip, ChipRow, ErrorText, LoadingView, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createPost } from '@/lib/feed';
import { type MediaItem } from '@/lib/media';
import { formatEuro } from '@/lib/booking';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { createQuickService, listMyServices, centsToEuroText, parseEuroToCents, MIN_PRICE_CENTS, type MyService, type Place } from '@/lib/my-services';
import { loadOffer, saveOffer } from '@/lib/offers';
import { discountedCents, EMPTY_VALIDITY } from '@/lib/validity';
import { fonts, useTheme } from '@/theme';
import { SpecificAvailabilityPicker, useSpecificAvailability } from '@/components/SpecificAvailability';

const DISCOUNTS = [0, 10, 20, 30];
const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function OfferEditScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id, serviceId: presetServiceId } = useLocalSearchParams<{ id?: string; serviceId?: string }>();
  const [ready, setReady] = useState(false);
  const [services, setServices] = useState<MyService[]>([]);
  const [policies, setPolicies] = useState<CancelPolicy[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(presetServiceId ?? null);
  const availability = useSpecificAvailability({ sellerId: userId, scope: 'offer', targetId: id ?? null, inheritServiceId: serviceId });
  const [publish, setPublish] = useState(!id);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlaces, setNewPlaces] = useState<Place[]>(['online']);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [discount, setDiscount] = useState(0);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(true);
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState<TierRow[]>(toRows(STANDARD_TIERS));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [svc, pol, offer] = await Promise.all([listMyServices(userId), listPolicies(userId), id ? loadOffer(id) : Promise.resolve(null)]);
      if (!alive) return;
      const slotServices = svc.services.filter((s) => s.active);
      setServices(slotServices);
      if (slotServices.length === 0 && !offer) setCreating(true); // senza servizi si parte creandone uno
      setPolicies(pol.policies);
      const base = pol.policies.find((p) => p.is_default)?.tiers ?? STANDARD_TIERS;
      setRows(toRows(offer?.cancel_tiers ?? base));
      if (offer) {
        setServiceId(offer.service_id);
        setPrice(centsToEuroText(offer.price_cents));
        setDuration(String(offer.duration_min));
        setDiscount(offer.discount_pct);
        setMessage(offer.message ?? '');
        setActive(offer.active);
        setCustom(offer.cancel_tiers !== null);
      } else {
        const first = slotServices.find((s) => s.id === presetServiceId) ?? slotServices[0];
        if (first) {
          setServiceId(first.id);
          setPrice(centsToEuroText(first.price_cents));
          setDuration(String(first.duration_min));
        }
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, id, presetServiceId]);

  if (!ready) return <LoadingView />;

  const defaultPolicy = policies.find((p) => p.is_default) ?? null;
  const service = services.find((s) => s.id === serviceId) ?? null;
  const serviceTiers: Tier[] | null = service?.cancel_tiers ?? null;
  const inheritedTiers: Tier[] = serviceTiers ?? defaultPolicy?.tiers ?? STANDARD_TIERS;
  const inheritedLabel = serviceTiers
    ? t('offers.policyOfService')
    : defaultPolicy
      ? t('myServices.policyDefaultNamed', { name: defaultPolicy.name })
      : t('myServices.policyDefaultStandard');

  const priceCents = parseEuroToCents(price);
  const finalCents = priceCents === null ? null : discountedCents(priceCents, discount);

  const pickService = (s: MyService) => {
    setCreating(false);
    setServiceId(s.id);
    setPrice(centsToEuroText(s.price_cents));
    setDuration(String(s.duration_min));
  };

  const save = async () => {
    if (!userId) return;
    const durationMin = Number(duration);
    if (!serviceId && !creating) return setErrorKey('offers.errors.service');
    if (creating && !newTitle.trim()) return setErrorKey('newService.errors.title');
    if (creating && newPlaces.length === 0) return setErrorKey('myServices.errors.places');
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('myServices.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('myServices.errors.duration');
    if (!availability.valid) return setErrorKey('availability.errors.fix');
    let cancelTiers: Tier[] | null = null;
    if (custom) {
      if (rowsIncomplete(rows)) return setErrorKey('policy.errors.empty');
      cancelTiers = fromRows(rows);
      const bad = validateTiers(cancelTiers);
      if (bad) return setErrorKey(bad);
    }
    setSaving(true);
    setErrorKey(null);
    let useServiceId = serviceId;
    if (creating) {
      // prima il servizio nuovo; se poi l'offerta non si salva, il servizio resta e non si duplica al secondo tentativo
      const made = await createQuickService({ sellerId: userId, title: newTitle, priceCents, durationMin, places: newPlaces });
      if (!made.service) {
        setSaving(false);
        return setErrorKey(made.errorKey);
      }
      useServiceId = made.service.id;
      setServices((list) => [...list, made.service!]);
      setServiceId(made.service.id);
      setCreating(false);
    }
    const saved = await saveOffer({
      id: id ?? null,
      sellerId: userId,
      serviceId: useServiceId!,
      priceCents,
      durationMin,
      discountPct: discount,
      validity: EMPTY_VALIDITY,
      message,
      active,
      cancelTiers,
    });
    if (!saved.id) {
      setSaving(false);
      return setErrorKey(saved.errorKey);
    }
    // disponibilità specifica dell'offerta: salvata dopo l'offerta (serve il suo id)
    const availFailure = await availability.persist(saved.id);
    if (availFailure) {
      setSaving(false);
      return setErrorKey(availFailure);
    }
    // l'offerta può uscire anche nel feed, con foto o video
    if (publish && active) {
      const posted = await createPost({ authorId: userId, kind: 'offer', body: message, lang: i18n.language, media, offerId: saved.id, serviceId: useServiceId! });
      if (posted.errorKey) {
        setSaving(false);
        setPublish(false); // l'offerta è salvata: un secondo tentativo non deve duplicarla
        return setErrorKey('offers.errors.postFailed');
      }
    }
    setSaving(false);
    router.replace('/my-services');
  };

  const section = { backgroundColor: theme.surface, borderRadius: 28, padding: 14, gap: 8 } as const;
  const svcTitle = creating ? newTitle.trim() || t('newService.chip') : (service?.title ?? '');
  const shownFinal = finalCents ?? priceCents ?? 0;
  const euro0 = (c: number) => formatEuro(c, i18n.language).replace(/[,.]00(?=\D|$)/, '');

  return (
    <Screen
      bare
      footer={
        <View style={{ gap: 8 }}>
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.cta, { backgroundColor: theme.ink, opacity: saving ? 0.6 : 1 }]}>
            <Text style={styles.ctaText}>{saving ? '…' : t(id ? 'policy.save' : 'offers.publishCta')}</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.page}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/my-services'))} style={[styles.cancel, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cancelText, { color: theme.text }]}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={[styles.topTitle, { color: theme.text }]}>{t(id ? 'offers.editTitle' : 'offers.newTitle')}</Text>
          <View style={{ width: 74 }} />
        </View>

        <View style={[styles.hero, { backgroundColor: theme.accent }]}>
          <View style={styles.heroTitleRow}>
            <Emoji name="party_popper" size={28} />
            <Text numberOfLines={1} style={[styles.heroService, { color: theme.onAccent }]}>{svcTitle}</Text>
          </View>
          <View style={styles.heroPriceRow}>
            <Text style={[styles.heroPrice, { color: theme.onAccent }]}>{euro0(shownFinal)}</Text>
            {discount > 0 && priceCents !== null ? <Text style={[styles.heroOld, { color: theme.onAccent }]}>{euro0(priceCents)}</Text> : null}
            {discount > 0 ? (
              <View style={[styles.heroPill, { backgroundColor: theme.ink }]}>
                <Text style={styles.heroPillText}>{`−${discount}%`}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={section}>
          <Text style={[styles.label, { color: theme.text }]}>{t('offers.service')}</Text>
          <ChipRow>
            {services.map((s) => (
              <Chip key={s.id} label={s.title} selected={!creating && s.id === serviceId} onPress={() => pickService(s)} />
            ))}
            {!id ? <Chip label={t('newService.chip')} selected={creating} onPress={() => { setCreating(true); setServiceId(null); setPrice(''); setDuration(''); }} /> : null}
          </ChipRow>
          {creating ? <NewServiceFields title={newTitle} onTitle={setNewTitle} places={newPlaces} onPlaces={setNewPlaces} /> : null}
        </View>

        <View style={section}>
          <TextField label={t('myServices.fieldPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={t('offers.priceHint')} />
          <Text style={[styles.label, { color: theme.text }]}>{t('offers.discount')}</Text>
          <ChipRow>
            {DISCOUNTS.map((d) => (
              <Chip key={d} label={d ? `−${d}%` : t('offers.fullPrice')} selected={discount === d} onPress={() => setDiscount(d)} />
            ))}
          </ChipRow>
          <Text style={[styles.label, { color: theme.text }]}>{t('offers.duration')}</Text>
          <ChipRow>
            {[...new Set([...DURATIONS, Number(duration) || 0].filter(Boolean))].sort((a, b) => a - b).map((d) => (
              <Chip key={d} label={`${d} min`} selected={Number(duration) === d} onPress={() => setDuration(String(d))} />
            ))}
          </ChipRow>
          <TextField label={t('offers.message')} value={message} onChangeText={setMessage} multiline maxLength={280} placeholder={t('offers.messagePlaceholder')} />
        </View>

        <View style={section}>
          <SpecificAvailabilityPicker state={availability} defaultLabel={t('availability.followService')} specificLabel={t('availability.specificOffer')} />
        </View>

        <View style={section}>
          <Text style={[styles.label, { color: theme.text }]}>{t('offers.policySection')}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t('offers.policyHelp')}</Text>
          <PolicySection
            inheritedLabel={inheritedLabel}
            inheritedTiers={inheritedTiers}
            policies={policies}
            custom={custom}
            onCustomChange={setCustom}
            rows={rows}
            onRowsChange={setRows}
          />
        </View>

        <View style={section}>
          <Checkbox label={t('myServices.activeLabel')} checked={active} onChange={setActive} />
          <Checkbox label={t('offers.publish')} checked={publish} onChange={setPublish} />
          {publish && userId ? (
            <>
              <Text style={[styles.hint, { color: theme.muted }]}>{t('offers.publishHint')}</Text>
              <MediaPicker items={media} onChange={setMedia} bucket="media" userId={userId} />
            </>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 56, gap: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancel: { height: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  cancelText: { fontFamily: fonts.medium, fontSize: 15 },
  topTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  hero: { borderRadius: 34, paddingVertical: 16, paddingHorizontal: 18, gap: 18 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroService: { flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  heroPriceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroPrice: { fontFamily: fonts.semibold, fontSize: 64, letterSpacing: -3.8, lineHeight: 64 },
  heroOld: { fontFamily: fonts.medium, fontSize: 20, textDecorationLine: 'line-through', paddingBottom: 6 },
  heroPill: { marginLeft: 'auto', height: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  heroPillText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 14 },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  hint: { fontFamily: fonts.regular, fontSize: 13 },
  cta: { height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 17 },
});
