import { Fragment, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MediaPicker } from '@/components/MediaView';
import { NewServiceFields } from '@/components/NewServiceFields';
import { Body, Checkbox, Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createPost } from '@/lib/feed';
import { type MediaItem } from '@/lib/media';
import { formatEuro } from '@/lib/booking';
import { HOURS, hourStart, isBusy, loadCalendar, type Calendar } from '@/lib/availability';
import { centsToEuroText, createQuickService, listMyServices, MIN_PRICE_CENTS, parseEuroToCents, PLACES, type MyService, type Place } from '@/lib/my-services';
import { loadMyProfile } from '@/lib/profile-edit';
import { createLink, linkUrl, shareText, type SlotLink } from '@/lib/slot-links';
import { dayLabel, nextDays } from '@/lib/time';
import { discountedCents, validateValidity, type Range } from '@/lib/validity';

const DISCOUNTS = [0, 10, 20, 30];
const DURATIONS = [15, 30, 45, 60, 90, 120];

export default function SlotLinkEditScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [days] = useState(() => nextDays(14, Date.now()));
  const [ready, setReady] = useState(false);
  const [services, setServices] = useState<MyService[]>([]);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [travelFee, setTravelFee] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem[]>([]);
  const [publish, setPublish] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlaces, setNewPlaces] = useState<Place[]>(['online']);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [discount, setDiscount] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [ranges, setRanges] = useState<Range[]>([{ from: '09:00', to: '13:00' }]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [spaceFee, setSpaceFee] = useState('');
  const [travel, setTravel] = useState('');
  const [message, setMessage] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<SlotLink | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [svc, cal, profile] = await Promise.all([listMyServices(userId), loadCalendar(userId, days[0], days[days.length - 1]), loadMyProfile(userId)]);
      if (!alive) return;
      const active = svc.services.filter((s) => s.active);
      setServices(active);
      if (active.length === 0) {
        setCreating(true); // senza servizi si parte creandone uno
        setPlaces(['online']);
      }
      setCalendar(cal.calendar);
      setTravelFee(profile?.travel_fee_cents ?? 0);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, days]);

  if (!ready) return <LoadingView />;

  const service = services.find((s) => s.id === serviceId) ?? null;
  const freeHours = (day: string) => (calendar ? HOURS.filter((h) => calendar.open.has(hourStart(day, h)) && !isBusy(calendar, hourStart(day, h))).length : 0);
  const priceCents = parseEuroToCents(price);

  const pickService = (s: MyService) => {
    setCreating(false);
    setServiceId(s.id);
    setPrice(centsToEuroText(s.price_cents));
    setDuration(String(s.duration_min));
    setPlaces(s.places);
    setSpaceFee(s.space_fee_cents ? centsToEuroText(s.space_fee_cents) : '');
    setTravel(travelFee ? centsToEuroText(travelFee) : '');
  };
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const updateRange = (i: number, patch: Partial<Range>) => setRanges((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!userId || (!service && !creating)) return setErrorKey('slotLinks.errors.service');
    if (creating && !newTitle.trim()) return setErrorKey('newService.errors.title');
    if (creating && newPlaces.length === 0) return setErrorKey('myServices.errors.places');
    const durationMin = Number(duration);
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('myServices.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('myServices.errors.duration');
    if (picked.length === 0) return setErrorKey('slotLinks.errors.days');
    if (validateValidity({ modes: ['orari'], days: [], from: '', to: '', wdays: [], ranges })) return setErrorKey('slotLinks.errors.ranges');
    if (places.length === 0) return setErrorKey('myServices.errors.places');
    const extraSpace = places.includes('sede') && spaceFee.trim() ? parseEuroToCents(spaceFee) : 0;
    const extraTravel = places.includes('domicilio') && travel.trim() ? parseEuroToCents(travel) : 0;
    if (extraSpace === null || extraTravel === null) return setErrorKey('slotLinks.errors.extra');
    setSaving(true);
    setErrorKey(null);
    let useServiceId = service?.id ?? null;
    if (creating) {
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
    const result = await createLink({
      sellerId: userId,
      serviceId: useServiceId!,
      priceCents,
      durationMin,
      discountPct: discount,
      days: picked,
      ranges,
      places,
      extraSpaceCents: extraSpace,
      extraTravelCents: extraTravel,
      message,
      preview: preview[0] ?? null,
    });
    if (result.link && publish) {
      const posted = await createPost({ authorId: userId, kind: 'slots', body: message, lang: i18n.language, media: [], slotLinkId: result.link.id, serviceId: useServiceId! });
      if (posted.errorKey) setShareNote(t('slotLinks.errors.postFailed'));
    }
    setSaving(false);
    if (result.link) setCreated(result.link);
    else setErrorKey(result.errorKey);
  };

  if (created) {
    const url = linkUrl(created.code);
    return (
      <Screen>
        <Title>{t('slotLinks.createdTitle')}</Title>
        <Body muted>{t('slotLinks.createdBody')}</Body>
        <Spacer />
        <Body>{url}</Body>
        <Spacer />
        {shareNote ? <Body muted>{shareNote}</Body> : null}
        <Button
          title={t('slotLinks.share')}
          onPress={async () => {
            const text = `${created.message ? `${created.message}\n` : ''}${url}`;
            const r = await shareText(text);
            setShareNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null);
          }}
        />
        <Spacer size={12} />
        <Button title={t('slotLinks.title')} variant="ghost" onPress={() => router.replace('/slot-links')} />
      </Screen>
    );
  }

  const finalCents = priceCents === null ? null : discountedCents(priceCents, discount);

  return (
    <Screen>
      <Title>{t('slotLinks.newTitle')}</Title>
      <Body muted>{t('slotLinks.intro')}</Body>
      <Spacer />

      <Body>{t('offers.service')}</Body>
      <Spacer size={8} />
            <ChipRow>
        {services.map((s) => (
          <Chip key={s.id} label={s.title} selected={!creating && s.id === serviceId} onPress={() => pickService(s)} />
        ))}
        <Chip label={t('newService.chip')} selected={creating} onPress={() => { setCreating(true); setServiceId(null); setPrice(''); setDuration(''); setPlaces(newPlaces); setSpaceFee(''); setTravel(travelFee ? centsToEuroText(travelFee) : ''); }} />
      </ChipRow>
      {creating ? <NewServiceFields title={newTitle} onTitle={setNewTitle} places={newPlaces} onPlaces={(p) => { setNewPlaces(p); setPlaces(p); }} /> : null}

      {service || creating ? (
        <>
          <TextField label={t('slotLinks.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={service ? t('slotLinks.priceHint', { amount: formatEuro(service.price_cents, i18n.language) }) : undefined} />
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
          {finalCents !== null ? <Body muted>{t('offers.finalPrice', { amount: formatEuro(finalCents, i18n.language) })}</Body> : null}

          <Spacer />
          <Body>{t('slotLinks.days')}</Body>
          <Spacer size={8} />
          <ChipRow>
            {days.map((day) => {
              const free = freeHours(day);
              const label = `${dayLabel(day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${free ? t('slotLinks.free', { count: free }) : t('slotLinks.closed')}`;
              return <Chip key={day} label={label} selected={picked.includes(day)} onPress={() => free && setPicked((p) => toggle(p, day))} />;
            })}
          </ChipRow>
          <Body muted>{t('slotLinks.daysHint')}</Body>

          <Spacer />
          <Body>{t('slotLinks.ranges')}</Body>
          {ranges.map((range, i) => (
            <Fragment key={i}>
              <TextField label={t('offers.rangeFrom')} value={range.from} onChangeText={(v) => updateRange(i, { from: v.trim() })} placeholder="09:00" autoCapitalize="none" />
              <TextField label={t('offers.rangeTo')} value={range.to} onChangeText={(v) => updateRange(i, { to: v.trim() })} placeholder="13:00" autoCapitalize="none" />
              {ranges.length > 1 ? <Button title={t('offers.removeRange')} variant="ghost" onPress={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))} /> : null}
              <Spacer size={8} />
            </Fragment>
          ))}
          <Button title={t('offers.addRange')} variant="ghost" onPress={() => setRanges((rs) => [...rs, { from: '', to: '' }])} />

          <Spacer />
          <Body>{t('myServices.where')}</Body>
          <Spacer size={8} />
          <ChipRow>
            {PLACES.filter((p) => (service ? service.places : newPlaces).includes(p)).map((p) => (
              <Chip key={p} label={t(`places.${p}`)} selected={places.includes(p)} onPress={() => setPlaces((l) => toggle(l, p))} />
            ))}
          </ChipRow>
          {places.includes('sede') ? <TextField label={t('myServices.spaceFee')} value={spaceFee} onChangeText={setSpaceFee} keyboardType="decimal-pad" hint={t('slotLinks.extraHint')} /> : null}
          {places.includes('domicilio') ? <TextField label={t('profileEdit.travelFee')} value={travel} onChangeText={setTravel} keyboardType="decimal-pad" hint={t('slotLinks.extraHint')} /> : null}

          <TextField label={t('offers.message')} value={message} onChangeText={setMessage} multiline maxLength={280} placeholder={t('slotLinks.messagePlaceholder')} />
          <Body>{t('slotLinks.preview')}</Body>
          <Body muted>{t('slotLinks.previewHint')}</Body>
          {userId ? <MediaPicker items={preview} onChange={setPreview} bucket="media" userId={userId} max={1} /> : null}
          <Spacer size={8} />
          <Checkbox label={t('slotLinks.publish')} checked={publish} onChange={setPublish} />
        </>
      ) : null}

      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('slotLinks.create')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/slot-links')} />
    </Screen>
  );
}

