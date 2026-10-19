import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NewServiceFields } from '@/components/NewServiceFields';
import { PolicySection } from '@/components/PolicySection';
import { fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { Body, Button, Checkbox, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { createQuickService, listMyServices, centsToEuroText, parseEuroToCents, MIN_PRICE_CENTS, type MyService, type Place } from '@/lib/my-services';
import { loadOffer, saveOffer, validityText } from '@/lib/offers';
import { discountedCents, EMPTY_VALIDITY, validateValidity, type Range, type Validity } from '@/lib/validity';

const DISCOUNTS = [0, 10, 20, 30];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const MODES = ['giorni', 'periodo', 'settimana', 'orari'] as const;

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function OfferEditScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id, serviceId: presetServiceId } = useLocalSearchParams<{ id?: string; serviceId?: string }>();
  const [ready, setReady] = useState(false);
  const [services, setServices] = useState<MyService[]>([]);
  const [policies, setPolicies] = useState<CancelPolicy[]>([]);
  const [serviceId, setServiceId] = useState<string | null>(presetServiceId ?? null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlaces, setNewPlaces] = useState<Place[]>(['online']);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [discount, setDiscount] = useState(0);
  const [validity, setValidity] = useState<Validity>(EMPTY_VALIDITY);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(true);
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState<TierRow[]>(toRows(STANDARD_TIERS));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [days14] = useState(() => [...Array(14)].map((_, i) => new Date(Date.now() + (i + 1) * 86_400_000)));

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
        setValidity({ ...EMPTY_VALIDITY, ...offer.validity });
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
  const toggleMode = (mode: string) =>
    setValidity((v) => ({ ...v, modes: v.modes.includes(mode) ? v.modes.filter((m) => m !== mode) : [...v.modes, mode] }));
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const updateRange = (index: number, patch: Partial<Range>) =>
    setValidity((v) => ({ ...v, ranges: v.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) }));

  const save = async () => {
    if (!userId) return;
    const durationMin = Number(duration);
    if (!serviceId && !creating) return setErrorKey('offers.errors.service');
    if (creating && !newTitle.trim()) return setErrorKey('newService.errors.title');
    if (creating && newPlaces.length === 0) return setErrorKey('myServices.errors.places');
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('myServices.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('myServices.errors.duration');
    const invalid = validateValidity(validity);
    if (invalid) return setErrorKey(`offers.errors.${invalid}`);
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
    const failure = await saveOffer({
      id: id ?? null,
      sellerId: userId,
      serviceId: useServiceId!,
      priceCents,
      durationMin,
      discountPct: discount,
      validity,
      message,
      active,
      cancelTiers,
    });
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/my-offers');
  };

  return (
    <Screen>
      <Title>{t(id ? 'offers.editTitle' : 'offers.newTitle')}</Title>
      <Spacer />

      <Body>{t('offers.service')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {services.map((s) => (
          <Chip key={s.id} label={s.title} selected={!creating && s.id === serviceId} onPress={() => pickService(s)} />
        ))}
        {!id ? <Chip label={t('newService.chip')} selected={creating} onPress={() => { setCreating(true); setServiceId(null); setPrice(''); setDuration(''); }} /> : null}
      </ChipRow>
      {creating ? <NewServiceFields title={newTitle} onTitle={setNewTitle} places={newPlaces} onPlaces={setNewPlaces} /> : null}

      <TextField label={t('myServices.fieldPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={t('offers.priceHint')} />
      <Body>{t('offers.duration')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {[...new Set([...DURATIONS, Number(duration) || 0].filter(Boolean))].sort((a, b) => a - b).map((d) => (
          <Chip key={d} label={`${d} min`} selected={Number(duration) === d} onPress={() => setDuration(String(d))} />
        ))}
      </ChipRow>

      <Body>{t('offers.discount')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {DISCOUNTS.map((d) => (
          <Chip key={d} label={d ? `−${d}%` : t('offers.fullPrice')} selected={discount === d} onPress={() => setDiscount(d)} />
        ))}
      </ChipRow>
      {finalCents !== null ? (
        <Body muted>{t('offers.finalPrice', { amount: formatEuro(finalCents, i18n.language) })}</Body>
      ) : null}

      <Spacer />
      <Body>{t('offers.validity')}</Body>
      <Spacer size={8} />
      <ChipRow>
        <Chip label={t('offers.always')} selected={validity.modes.length === 0} onPress={() => setValidity((v) => ({ ...v, modes: [] }))} />
        {MODES.map((mode) => (
          <Chip key={mode} label={t(`offers.mode.${mode}`)} selected={validity.modes.includes(mode)} onPress={() => toggleMode(mode)} />
        ))}
      </ChipRow>
      {validity.modes.includes('giorni') ? (
        <ChipRow>
          {days14.map((d) => {
            const key = isoDay(d);
            return (
              <Chip
                key={key}
                label={new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(d)}
                selected={validity.days.includes(key)}
                onPress={() => setValidity((v) => ({ ...v, days: toggleIn(v.days, key) }))}
              />
            );
          })}
        </ChipRow>
      ) : null}
      {validity.modes.includes('periodo') ? (
        <>
          <TextField label={t('offers.periodFrom')} value={validity.from} onChangeText={(v) => setValidity((x) => ({ ...x, from: v.trim() }))} placeholder="2026-10-20" autoCapitalize="none" />
          <TextField label={t('offers.periodTo')} value={validity.to} onChangeText={(v) => setValidity((x) => ({ ...x, to: v.trim() }))} placeholder="2026-10-31" autoCapitalize="none" />
        </>
      ) : null}
      {validity.modes.includes('settimana') ? (
        <ChipRow>
          {[1, 2, 3, 4, 5, 6, 0].map((w) => (
            <Chip
              key={w}
              label={new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(2024, 0, 7 + w))}
              selected={validity.wdays.includes(w)}
              onPress={() => setValidity((v) => ({ ...v, wdays: toggleIn(v.wdays, w) }))}
            />
          ))}
        </ChipRow>
      ) : null}
      {validity.modes.includes('orari') ? (
        <>
          {validity.ranges.map((range, index) => (
            <RangeRow
              key={index}
              range={range}
              removable={validity.ranges.length > 1}
              onChange={(patch) => updateRange(index, patch)}
              onRemove={() => setValidity((v) => ({ ...v, ranges: v.ranges.filter((_, i) => i !== index) }))}
            />
          ))}
          <Button title={t('offers.addRange')} variant="ghost" onPress={() => setValidity((v) => ({ ...v, ranges: [...v.ranges, { from: '', to: '' }] }))} />
        </>
      ) : null}
      <Body muted>{t('offers.validityNow', { text: validityText(validity, i18n.language, t) })}</Body>

      <Spacer />
      <Title>{t('offers.policySection')}</Title>
      <Body muted>{t('offers.policyHelp')}</Body>
      <Spacer size={8} />
      <PolicySection
        inheritedLabel={inheritedLabel}
        inheritedTiers={inheritedTiers}
        policies={policies}
        custom={custom}
        onCustomChange={setCustom}
        rows={rows}
        onRowsChange={setRows}
      />

      <Spacer />
      <TextField label={t('offers.message')} value={message} onChangeText={setMessage} multiline maxLength={280} />
      <Checkbox label={t('myServices.activeLabel')} checked={active} onChange={setActive} />

      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/my-offers')} />
    </Screen>
  );
}

function RangeRow({ range, removable, onChange, onRemove }: { range: Range; removable: boolean; onChange: (p: Partial<Range>) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <TextField label={t('offers.rangeFrom')} value={range.from} onChangeText={(v) => onChange({ from: v.trim() })} placeholder="09:00" autoCapitalize="none" />
      <TextField label={t('offers.rangeTo')} value={range.to} onChangeText={(v) => onChange({ to: v.trim() })} placeholder="13:00" autoCapitalize="none" />
      {removable ? <Button title={t('offers.removeRange')} variant="ghost" onPress={onRemove} /> : null}
      <Spacer size={8} />
    </>
  );
}
