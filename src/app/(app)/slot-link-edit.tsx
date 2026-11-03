import { Fragment, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { MediaPicker } from '@/components/MediaView';
import { Avatar } from '@/components/Avatar';
import { Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField } from '@/components/ui';
import { listConversations, openConversation, sendCard, type ConversationItem } from '@/lib/chat';
import { fonts, pastelFor, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { type MediaItem } from '@/lib/media';
import { formatEuro } from '@/lib/booking';
import { centsToEuroText, createLinkOnlyService, deleteService, listMyServices, MIN_PRICE_CENTS, parseEuroToCents, PLACES, type MyService, type Place } from '@/lib/my-services';
import { loadMyProfile } from '@/lib/profile-edit';
import { createLink, linkUrl, shareText, type SlotLink } from '@/lib/slot-links';
import { dayLabel, nextDays, romeToDate } from '@/lib/time';
import { discountedCents, localParts, validateValidity, type Range } from '@/lib/validity';

const DISCOUNTS = [0, 10, 20, 30];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const IMMEDIATE_OFFSETS = [15, 30, 60]; // minuti da adesso
type Mode = 'days' | 'exact' | 'now';
const nowMs = () => Date.now();

export default function SlotLinkEditScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [days] = useState(() => nextDays(14, Date.now()));
  const [ready, setReady] = useState(false);
  const [services, setServices] = useState<MyService[]>([]);
  const [travelFee, setTravelFee] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem[]>([]);
  const [custom, setCustom] = useState(false); // B: slot creato apposta (servizio solo-link)
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [discount, setDiscount] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('days');
  const [exactDay, setExactDay] = useState<string | null>(null);
  const [exactTime, setExactTime] = useState('');
  const [offset, setOffset] = useState(30);
  const [today] = useState(() => localParts(new Date()).date);
  const [ranges, setRanges] = useState<Range[]>([{ from: '09:00', to: '13:00' }]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [spaceFee, setSpaceFee] = useState('');
  const [travel, setTravel] = useState('');
  const [message, setMessage] = useState('');
  const [validMin, setValidMin] = useState(1440);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<SlotLink | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chats, setChats] = useState<ConversationItem[] | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [svc, profile] = await Promise.all([listMyServices(userId), loadMyProfile(userId)]);
      if (!alive) return;
      const active = svc.services.filter((s) => s.active);
      setServices(active);
      if (active.length === 0) {
        setCustom(true); // senza servizi nel catalogo si parte da uno slot creato apposta
        setPlaces(['online']);
      }
      setTravelFee(profile?.travel_fee_cents ?? 0);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, days]);

  if (!ready) return <LoadingView />;

  const service = services.find((s) => s.id === serviceId) ?? null;
  const priceCents = parseEuroToCents(price);

  const chooseCatalog = () => {
    setCustom(false);
    setServiceId(null);
    setPrice('');
    setDuration('');
    setPlaces([]);
    setSpaceFee('');
    setTravel('');
  };
  const chooseCustom = () => {
    setCustom(true);
    setServiceId(null);
    setPrice('');
    setDuration('');
    setPlaces(['online']);
    setSpaceFee('');
    setTravel(travelFee ? centsToEuroText(travelFee) : '');
  };
  const pickService = (s: MyService) => {
    setCustom(false);
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
    if (!userId || (!service && !custom)) return setErrorKey('slotLinks.errors.service');
    if (custom && !newTitle.trim()) return setErrorKey('slotLinks.customTitleError');
    const durationMin = Number(duration);
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('myServices.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('myServices.errors.duration');
    let startsAt: Date | null = null;
    if (mode === 'days') {
      if (picked.length === 0) return setErrorKey('slotLinks.errors.days');
      if (validateValidity({ modes: ['orari'], days: [], from: '', to: '', wdays: [], ranges })) return setErrorKey('slotLinks.errors.ranges');
    } else if (mode === 'exact') {
      if (!exactDay || !/^([01]\d|2[0-3]):[0-5]\d$/.test(exactTime.trim())) return setErrorKey('slotLinks.errors.exact');
      startsAt = romeToDate(exactDay, exactTime.trim());
      if (startsAt.getTime() < nowMs() + 60_000) return setErrorKey('slotLinks.errors.exactPast');
    } else {
      // subito: tra `offset` minuti, arrotondato ai 5 minuti successivi
      const ms = Math.ceil((nowMs() + offset * 60_000) / 300_000) * 300_000;
      startsAt = new Date(ms);
    }
    if (places.length === 0) return setErrorKey('myServices.errors.places');
    const extraSpace = places.includes('sede') && spaceFee.trim() ? parseEuroToCents(spaceFee) : 0;
    const extraTravel = places.includes('domicilio') && travel.trim() ? parseEuroToCents(travel) : 0;
    if (extraSpace === null || extraTravel === null) return setErrorKey('slotLinks.errors.extra');
    setSaving(true);
    setErrorKey(null);
    let useServiceId = service?.id ?? null;
    if (custom) {
      const made = await createLinkOnlyService({ sellerId: userId, title: newTitle, description: newDescription, priceCents, durationMin, places });
      if (!made.service) {
        setSaving(false);
        return setErrorKey(made.errorKey);
      }
      useServiceId = made.service.id;
    }
    const result = await createLink({
      sellerId: userId,
      serviceId: useServiceId!,
      priceCents,
      durationMin,
      discountPct: discount,
      days: picked,
      ranges,
      startsAt,
      validForMin: validMin,
      places,
      extraSpaceCents: extraSpace,
      extraTravelCents: extraTravel,
      message,
      preview: preview[0] ?? null,
    });
    if (!result.link && custom && useServiceId) await deleteService(useServiceId); // niente servizi orfani se il link non si crea
    setSaving(false);
    if (result.link) setCreated(result.link);
    else setErrorKey(result.errorKey);
  };

  const finalCents = priceCents === null ? null : discountedCents(priceCents, discount);
  const sectionStyle = { backgroundColor: theme.surface, borderRadius: 28, padding: 14, gap: 8 } as const;

  if (created) {
    const url = linkUrl(created.code);
    const when = created.starts_at
      ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(created.starts_at))
      : created.days.map((d) => `${dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric' })}`).join(' · ');
    const summary = `${newTitle.trim() || service?.title || ''}`;
    const shareLink = async () => {
      const r = await shareText(`${created.message ? `${created.message}\n` : ''}${url}`);
      setShareNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null);
    };
    const openChats = async () => {
      setChatOpen(true);
      if (!chats && userId) setChats(await listConversations(userId));
    };
    const sendTo = async (c: ConversationItem) => {
      if (!userId) return;
      const conv = await openConversation(userId, c.otherId);
      if (!conv.id) return setShareNote(t('errors.generic'));
      const failure = await sendCard(conv.id, userId, { kind: 'slot', code: created.code, title: summary || t('slotLinks.link'), price_cents: created.price_cents, duration_min: created.duration_min }, i18n.language.slice(0, 2));
      setChatOpen(false);
      setShareNote(failure ? t(failure) : t('slotLinks.sentTo', { name: c.otherName }));
      setSentTo(failure ? null : c.id);
    };
    return (
      <Screen
        bare
        footer={
          <Pressable accessibilityRole="button" onPress={() => router.replace('/my-services')} style={[styles.done, { backgroundColor: theme.ink }]}>
            <Text style={styles.doneText}>{t('slotLinks.done')}</Text>
          </Pressable>
        }>
        <View style={[styles.hero, { backgroundColor: theme.accent }]}>
          <Text style={[styles.heroTitle, { color: theme.onAccent }]}>{t('slotLinks.readyTitle')}</Text>
          <Text style={[styles.heroSub, { color: theme.onAccent }]}>{t('slotLinks.createdBody')}</Text>
          <View style={[styles.summary, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sumTitle, { color: theme.text }]}>{summary}</Text>
            <Text style={[styles.sumMeta, { color: theme.muted }]}>{`${created.duration_min} min · ${formatEuro(discountedCents(created.price_cents, created.discount_pct), i18n.language)}`}</Text>
            {created.message ? <Text style={[styles.sumMsg, { backgroundColor: theme.bg, color: theme.text }]}>{`“${created.message}”`}</Text> : null}
            <View style={[styles.dayChip, { backgroundColor: theme.ink }]}>
              <Text style={styles.dayChipText}>{when}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.linkCard, { backgroundColor: theme.surface }]}>
          <View style={[styles.linkRow, { backgroundColor: theme.bg }]}>
            <Text numberOfLines={1} style={[styles.linkText, { color: theme.text }]}>{url.replace(/^https?:\/\//, '')}</Text>
            <Pressable accessibilityRole="button" onPress={() => void shareLink()} style={[styles.copy, { backgroundColor: theme.ink }]}>
              <Text style={styles.copyText}>{t('slotLinks.copy')}</Text>
            </Pressable>
          </View>
          <View style={styles.twoBtns}>
            <Pressable accessibilityRole="button" onPress={() => void openChats()} style={[styles.soft, { backgroundColor: theme.bg }]}>
              <Text style={[styles.softText, { color: theme.text }]}>{t('slotLinks.sendInChat')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void shareLink()} style={[styles.soft, { backgroundColor: theme.bg }]}>
              <Text style={[styles.softText, { color: theme.text }]}>{t('slotLinks.shareMore')}</Text>
            </Pressable>
          </View>
          {shareNote ? <Text style={[styles.note, { color: theme.muted }]}>{shareNote}</Text> : null}
        </View>
        <Modal visible={chatOpen} transparent animationType="slide" onRequestClose={() => setChatOpen(false)}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.scrim }]} onPress={() => setChatOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
            <View style={[styles.grab, { backgroundColor: theme.fill }]} />
            <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('slotLinks.chooseChat')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={[styles.sheetCard, { backgroundColor: theme.surface }]}>
                {chats && chats.length > 0 ? (
                  chats.map((c, i) => (
                    <Pressable key={c.id} accessibilityRole="button" onPress={() => void sendTo(c)} style={[styles.chatRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                      <Avatar name={c.otherName} seed={c.otherId} size={40} path={c.otherAvatar} />
                      <Text style={[styles.sumTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>{c.otherName}</Text>
                      {sentTo === c.id ? <Ionicons name="checkmark" size={20} color={theme.success} /> : null}
                    </Pressable>
                  ))
                ) : (
                  <Text style={[styles.note, { color: theme.muted, padding: 16 }]}>{t('slotLinks.noChats')}</Text>
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>
      </Screen>
    );
  }

  const seg = (items: { key: string; label: string }[], value: string, onPick: (k: string) => void) => (
    <View style={[styles.seg, { backgroundColor: theme.surface }]}>
      {items.map((it) => (
        <Pressable key={it.key} accessibilityRole="radio" accessibilityState={{ checked: value === it.key }} onPress={() => onPick(it.key)} style={[styles.segItem, value === it.key && { backgroundColor: theme.ink }]}>
          <Text style={[styles.segText, { color: value === it.key ? '#FFFFFF' : theme.text }]} numberOfLines={1}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const dayChip = (day: string) => {
    const on = picked.includes(day);
    return (
      <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setPicked((p) => toggle(p, day))} style={[styles.dChip, on ? { backgroundColor: theme.ink } : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.muted }]}>
        <Text style={[styles.dChipText, { color: on ? '#FFFFFF' : theme.text }]}>{dayLabel(day, i18n.language, { weekday: 'short', day: 'numeric' })}</Text>
      </Pressable>
    );
  };

  return (
    <Screen
      bare
      footer={
        <View style={{ gap: 8 }}>
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.done, { backgroundColor: theme.ink, opacity: saving ? 0.6 : 1 }]}>
            <Text style={styles.doneText}>{saving ? '…' : t('slotLinks.create')}</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.page}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.replace('/my-services')} style={[styles.back, { backgroundColor: theme.surface }]}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{t('slotLinks.sendTitle')}</Text>
        </View>
        <Text style={[styles.intro, { color: theme.muted }]}>{t('slotLinks.sendIntro')}</Text>

        {seg([{ key: 'catalog', label: t('slotLinks.kindCatalog') }, { key: 'custom', label: t('slotLinks.kindCustom') }], custom ? 'custom' : 'catalog', (k) => (k === 'custom' ? chooseCustom() : chooseCatalog()))}

        {!custom ? (
          <View style={sectionStyle}>
            {services.length === 0 ? (
              <>
                <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.noServices')}</Text>
                <Button title={t('slotLinks.createService')} variant="ghost" onPress={() => router.push('/my-services')} />
              </>
            ) : null}
            {services.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: s.id === serviceId }} onPress={() => pickService(s)} style={[styles.svc, s.id === serviceId && { backgroundColor: theme.bg }]}>
                <View style={[styles.svcTile, { backgroundColor: pastelFor(s.id) }]}>
                  <Ionicons name="calendar" size={22} color={theme.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sumTitle, { color: theme.text }]} numberOfLines={1}>{s.title}</Text>
                  <Text style={[styles.sumMeta, { color: theme.muted }]}>{`${s.duration_min} min · ${formatEuro(s.price_cents, i18n.language)}`}</Text>
                </View>
                {s.id === serviceId ? <Ionicons name="checkmark-circle" size={22} color={theme.ink} /> : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={sectionStyle}>
            <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.customHint')}</Text>
            <TextField label={t('slotLinks.customName')} value={newTitle} onChangeText={setNewTitle} maxLength={80} placeholder={t('slotLinks.customNamePlaceholder')} />
            <TextField label={t('slotLinks.customDescription')} value={newDescription} onChangeText={setNewDescription} multiline maxLength={500} />
          </View>
        )}

        {service || custom ? (
          <>
            {seg([{ key: 'days', label: t('slotLinks.modeDays') }, { key: 'exact', label: t('slotLinks.modeExact') }, { key: 'now', label: t('slotLinks.modeNow') }], mode, (k) => setMode(k as Mode))}

            {mode === 'days' ? (
              <View style={sectionStyle}>
                <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.chooseAmong')}</Text>
                <View style={styles.wrap}>{days.map(dayChip)}</View>
                <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.daysHint')}</Text>
                <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.ranges')}</Text>
                {ranges.map((range, i) => (
                  <Fragment key={i}>
                    <View style={styles.rangeRow}>
                      <View style={{ flex: 1 }}>
                        <TextField label={t('offers.rangeFrom')} value={range.from} onChangeText={(v) => updateRange(i, { from: v.trim() })} placeholder="09:00" autoCapitalize="none" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField label={t('offers.rangeTo')} value={range.to} onChangeText={(v) => updateRange(i, { to: v.trim() })} placeholder="13:00" autoCapitalize="none" />
                      </View>
                    </View>
                    {ranges.length > 1 ? <Button title={t('offers.removeRange')} variant="ghost" onPress={() => setRanges((rs) => rs.filter((_, idx) => idx !== i))} /> : null}
                  </Fragment>
                ))}
                <Button title={t('offers.addRange')} variant="ghost" onPress={() => setRanges((rs) => [...rs, { from: '', to: '' }])} />
              </View>
            ) : null}

            {mode === 'exact' ? (
              <View style={sectionStyle}>
                <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.exactDay')}</Text>
                <ChipRow>
                  {[today, ...days.slice(0, 13)].map((day) => (
                    <Chip key={day} label={dayLabel(day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} selected={exactDay === day} onPress={() => setExactDay(day)} />
                  ))}
                </ChipRow>
                <TextField label={t('slotLinks.exactTime')} value={exactTime} onChangeText={(v) => setExactTime(v.trim())} placeholder="15:30" autoCapitalize="none" hint={t('slotLinks.exactHint')} />
              </View>
            ) : null}

            {mode === 'now' ? (
              <View style={sectionStyle}>
                <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.nowStart')}</Text>
                <ChipRow>
                  {IMMEDIATE_OFFSETS.map((m) => (
                    <Chip key={m} label={t('slotLinks.nowIn', { minutes: m })} selected={offset === m} onPress={() => setOffset(m)} />
                  ))}
                </ChipRow>
                <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.nowHint')}</Text>
              </View>
            ) : null}

            <View style={sectionStyle}>
              <TextField label={t('slotLinks.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={service ? t('slotLinks.priceHint', { amount: formatEuro(service.price_cents, i18n.language) }) : t('slotLinks.customPriceHint')} />
              <Text style={[styles.label, { color: theme.text }]}>{t('offers.duration')}</Text>
              <ChipRow>
                {[...new Set([...DURATIONS, Number(duration) || 0].filter(Boolean))].sort((a, b) => a - b).map((d) => (
                  <Chip key={d} label={`${d} min`} selected={Number(duration) === d} onPress={() => setDuration(String(d))} />
                ))}
              </ChipRow>
              <Text style={[styles.label, { color: theme.text }]}>{t('offers.discount')}</Text>
              <ChipRow>
                {DISCOUNTS.map((d) => (
                  <Chip key={d} label={d ? `−${d}%` : t('slotLinks.noDiscount')} selected={discount === d} onPress={() => setDiscount(d)} />
                ))}
              </ChipRow>
              {finalCents !== null && discount > 0 ? <Text style={[styles.hint, { color: theme.muted }]}>{t('offers.finalPrice', { amount: formatEuro(finalCents, i18n.language) })}</Text> : null}
            </View>

            <View style={sectionStyle}>
              <Text style={[styles.label, { color: theme.text }]}>{t('myServices.where')}</Text>
              <ChipRow>
                {PLACES.filter((p) => (service ? service.places.includes(p) : true)).map((p) => (
                  <Chip key={p} label={t(`places.${p}`)} selected={places.includes(p)} onPress={() => setPlaces((l) => toggle(l, p))} />
                ))}
              </ChipRow>
              {places.includes('sede') ? <TextField label={t('myServices.spaceFee')} value={spaceFee} onChangeText={setSpaceFee} keyboardType="decimal-pad" hint={t('slotLinks.extraHint')} /> : null}
              {places.includes('domicilio') ? <TextField label={t('profileEdit.travelFee')} value={travel} onChangeText={setTravel} keyboardType="decimal-pad" hint={t('slotLinks.extraHint')} /> : null}
            </View>

            <View style={sectionStyle}>
              <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.validFor')}</Text>
              <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.validForHint')}</Text>
              <ChipRow>
                {[30, 60, 120, 360, 720, 1440].map((m) => (
                  <Chip key={m} label={m < 60 ? `${m} min` : `${m / 60} h`} selected={validMin === m} onPress={() => setValidMin(m)} />
                ))}
              </ChipRow>
            </View>

            <View style={sectionStyle}>
              <TextField label={t('offers.message')} value={message} onChangeText={setMessage} multiline maxLength={280} placeholder={t('slotLinks.messagePlaceholder')} />
              <Text style={[styles.label, { color: theme.text }]}>{t('slotLinks.preview')}</Text>
              <Text style={[styles.hint, { color: theme.muted }]}>{t('slotLinks.previewHint')}</Text>
              {userId ? <MediaPicker items={preview} onChange={setPreview} bucket="media" userId={userId} max={1} /> : null}
            </View>
          </>
        ) : null}
        <Spacer size={80} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 56, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1.2 },
  intro: { fontFamily: fonts.regular, fontSize: 15, paddingHorizontal: 4 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  segItem: { flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segText: { fontFamily: fonts.semibold, fontSize: 13 },
  label: { fontFamily: fonts.semibold, fontSize: 14 },
  hint: { fontFamily: fonts.regular, fontSize: 13 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dChip: { height: 36, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dChipText: { fontFamily: fonts.semibold, fontSize: 14 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  svc: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 22 },
  svcTile: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sumTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  sumMeta: { fontFamily: fonts.regular, fontSize: 13 },
  sumMsg: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, overflow: 'hidden' },
  done: { height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 16 },
  hero: { margin: 8, borderRadius: 40, padding: 22, paddingTop: 56, gap: 20 },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 38, letterSpacing: -1.9, lineHeight: 40 },
  heroSub: { fontFamily: fonts.medium, fontSize: 15 },
  summary: { borderRadius: 30, padding: 14, gap: 10 },
  dayChip: { alignSelf: 'flex-start', height: 32, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  dayChipText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 13 },
  linkCard: { marginHorizontal: 8, borderRadius: 32, padding: 14, gap: 10 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 16, paddingRight: 6, borderRadius: 999 },
  linkText: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 15 },
  copy: { height: 42, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  copyText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 14 },
  twoBtns: { flexDirection: 'row', gap: 8 },
  soft: { flex: 1, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  softText: { fontFamily: fonts.semibold, fontSize: 15 },
  note: { fontFamily: fonts.regular, fontSize: 13 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 34, gap: 12 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.5 },
  sheetCard: { borderRadius: 26, padding: 6 },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
});
