import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AvailabilityPanel } from '@/components/AvailabilityPanel';
import { Emoji } from '@/components/Emoji';
import { PhotosSection } from '@/components/PhotosSection';
import { useSpecificAvailability } from '@/components/SpecificAvailability';
import { TierEditor, fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { TierLines } from '@/components/TierLines';
import { Button, ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { CALL_MIN_RATE_CENTS } from '@/lib/calls';
import { PLACES, type Place, centsToEuroText, loadMyService, MIN_PRICE_CENTS, parseEuroToCents, saveService } from '@/lib/my-services';
import { type ScheduleDraft, loadSchedule, toMinutes } from '@/lib/availability';
import { type MediaItem } from '@/lib/media';
import { attachDraftPhotos } from '@/lib/service-media';
import { shareText } from '@/lib/slot-links';
import { fonts, useTheme } from '@/theme';

type Kind = 'slot' | 'package' | 'per_minute';
type Step = 'type' | 'details' | 'where' | 'rules' | 'when' | 'include';

const PLACE_ICON: Record<Place, keyof typeof Ionicons.glyphMap> = { online: 'videocam-outline', sede: 'storefront-outline', domicilio: 'home-outline' };

/** Creazione e modifica di un servizio: percorso a passi (tipo, racconto, luoghi, regole, orari) e schermata finale. */
export default function ServiceEditScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(false);
  const [policies, setPolicies] = useState<CancelPolicy[]>([]);
  const [kind, setKind] = useState<Kind>('slot');
  const [stepIdx, setStepIdx] = useState(id ? 1 : 0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState(45);
  const [rate, setRate] = useState('');
  const [sessions, setSessions] = useState(5);
  const [active, setActive] = useState(true);
  const [places, setPlaces] = useState<Place[]>(['online']);
  const [spaceFee, setSpaceFee] = useState('');
  const [includes, setIncludes] = useState<string[]>([]);
  const [newInclude, setNewInclude] = useState('');
  const [custom, setCustom] = useState(false);
  const [rows, setRows] = useState<TierRow[]>(toRows(STANDARD_TIERS));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftPhotos, setDraftPhotos] = useState<MediaItem[]>([]);
  const [general, setGeneral] = useState<ScheduleDraft | null>(null);
  const [done, setDone] = useState<{ id: string; note: string | null } | null>(null);
  const availability = useSpecificAvailability({ sellerId: userId, scope: 'service', targetId: id ?? null, inheritServiceId: null });

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [list, service, gen] = await Promise.all([listPolicies(userId), id ? loadMyService(id) : Promise.resolve(null), loadSchedule(userId, 'general', null)]);
      if (!alive) return;
      setGeneral(gen);
      setPolicies(list.policies);
      const base = list.policies.find((p) => p.is_default)?.tiers ?? STANDARD_TIERS;
      setRows(toRows(service?.cancel_tiers ?? base));
      if (service) {
        setKind(service.kind);
        setTitle(service.title);
        setDescription(service.description ?? '');
        setPrice(centsToEuroText(service.price_cents ?? 0));
        setDuration(service.duration_min || 45);
        setRate(service.rate_cents_per_min ? centsToEuroText(service.rate_cents_per_min) : '');
        setSessions(service.sessions ?? 5);
        setActive(service.active);
        setPlaces(service.places);
        setSpaceFee(service.space_fee_cents ? centsToEuroText(service.space_fee_cents) : '');
        setIncludes(service.includes);
        setCustom(service.cancel_tiers !== null);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, id]);

  if (!ready) return <LoadingView />;

  const steps: Step[] = kind === 'per_minute' ? ['type', 'details', 'include'] : ['type', 'details', 'where', 'rules', 'when'];
  const idx = Math.min(stepIdx, steps.length - 1);
  const step = steps[idx];
  const isLast = idx === steps.length - 1;
  const euro = (c: number) => formatEuro(c, i18n.language);
  const defaultPolicy = policies.find((p) => p.is_default) ?? null;
  const defaultTiers: Tier[] = defaultPolicy?.tiers ?? STANDARD_TIERS;

  const validate = (s: Step): string | null => {
    if (s === 'details') {
      if (!title.trim()) return 'myServices.errors.title';
      if (kind === 'per_minute') {
        const r = parseEuroToCents(rate);
        if (r === null || r < CALL_MIN_RATE_CENTS) return 'calls.errors.rate';
      } else {
        const p = parseEuroToCents(price);
        if (p === null || p < MIN_PRICE_CENTS) return 'myServices.errors.price';
        if (duration < 5 || duration > 480) return 'myServices.errors.duration';
        if (kind === 'package' && (sessions < 2 || sessions > 50)) return 'myServices.errors.sessions';
      }
    }
    if (s === 'where') {
      if (places.length === 0) return 'myServices.errors.places';
      if (places.includes('sede') && spaceFee.trim() && parseEuroToCents(spaceFee) === null) return 'myServices.errors.spaceFee';
    }
    if (s === 'rules' && custom) {
      if (rowsIncomplete(rows)) return 'policy.errors.empty';
      const invalid = validateTiers(fromRows(rows));
      if (invalid) return invalid;
    }
    if (s === 'when' && !availability.valid) return 'availability.errors.fix';
    return null;
  };

  const save = async () => {
    if (!userId) return;
    for (const s of steps) {
      const bad = validate(s);
      if (bad) {
        setStepIdx(steps.indexOf(s));
        return setErrorKey(bad);
      }
    }
    setSaving(true);
    setErrorKey(null);
    const lines = includes.map((x) => x.trim()).filter(Boolean);
    let result;
    if (kind === 'per_minute') {
      result = await saveService({ id: id ?? null, sellerId: userId, title, description, priceCents: 0, durationMin: 0, active, cancelTiers: null, places: ['online'], includes: lines, spaceFeeCents: 0, kind: 'per_minute', rateCents: parseEuroToCents(rate) ?? 0 });
    } else {
      result = await saveService({
        id: id ?? null, sellerId: userId, title, description, priceCents: parseEuroToCents(price) ?? 0, durationMin: duration, active,
        cancelTiers: custom ? fromRows(rows) : null, places, includes: lines,
        spaceFeeCents: places.includes('sede') && spaceFee.trim() ? parseEuroToCents(spaceFee) ?? 0 : 0,
        kind, sessions: kind === 'package' ? sessions : null,
      });
    }
    if (result.errorKey || !result.id) {
      setSaving(false);
      return setErrorKey(result.errorKey ?? 'errors.generic');
    }
    const availFailure = kind === 'per_minute' ? null : await availability.persist(result.id);
    const photoFailure = id ? null : await attachDraftPhotos(result.id, draftPhotos);
    setSaving(false);
    if (availFailure ?? photoFailure) return setErrorKey((availFailure ?? photoFailure) as string);
    if (id) router.replace('/my-services');
    else setDone({ id: result.id, note: null });
  };

  const next = () => {
    const bad = validate(step);
    if (bad) return setErrorKey(bad);
    setErrorKey(null);
    if (isLast) void save();
    else setStepIdx(idx + 1);
  };
  const back = () => {
    setErrorKey(null);
    const first = id ? 1 : 0;
    if (idx > first) setStepIdx(idx - 1);
    else if (router.canGoBack()) router.back();
    else router.replace('/my-services');
  };

  // ───────── schermata finale
  if (done) {
    const url = `https://timeet.world/service/${done.id}`;
    const sub = kind === 'per_minute' ? t('svc.doneSubCall') : `${duration} min`;
    return (
      <Screen bare>
        <View style={[styles.doneHero, { backgroundColor: theme.accent }]}>
          <Emoji name="party_popper" size={64} />
          <Text style={[styles.doneTitle, { color: theme.onAccent }]}>{t('svc.doneTitle')}</Text>
          <View style={[styles.doneCard, { backgroundColor: theme.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
              <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text>
            </View>
            <Text style={[styles.donePrice, { color: theme.text }]}>{kind === 'per_minute' ? `${euro(parseEuroToCents(rate) ?? 0)}/min` : euro(parseEuroToCents(price) ?? 0)}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.rowTitle, { color: theme.text, fontSize: 15 }]}>{t('svc.shareLink')}</Text>
            <View style={[styles.linkBox, { backgroundColor: theme.bg }]}>
              <Text numberOfLines={1} style={[styles.linkText, { color: theme.text }]}>{url.replace('https://', '')}</Text>
              <Pressable accessibilityRole="button" onPress={async () => { const r = await shareText(url); setDone({ ...done, note: r === 'copied' ? t('slotLinks.copied') : null }); }} style={[styles.copy, { backgroundColor: theme.ink }]}>
                <Text style={[styles.copyText, { color: '#FFFFFF' }]}>{t('svc.copy')}</Text>
              </Pressable>
            </View>
            {done.note ? <Text style={[styles.rowSub, { color: theme.muted }]}>{done.note}</Text> : null}
          </View>
          <View style={[styles.card, { backgroundColor: theme.surface, padding: 8 }]}>
            {[
              { e: 'sparkles', a: t('svc.announce'), b: t('svc.announceSub'), go: () => router.push('/new-post') },
              { e: 'party_popper', a: t('svc.makeOffer'), b: t('svc.makeOfferSub'), go: () => router.push('/offer-edit') },
              { e: 'camera', a: t('svc.addPhotos'), b: t('svc.addPhotosSub'), go: () => router.push({ pathname: '/service-edit', params: { id: done.id } }) },
            ].map((r, i) => (
              <Pressable key={r.e + i} accessibilityRole="button" onPress={r.go} style={[styles.linkRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                <View style={[styles.round44, { backgroundColor: theme.bg }]}><Emoji name={r.e} size={26} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{r.a}</Text>
                  <Text style={[styles.rowSub, { color: theme.muted }]}>{r.b}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Button title={t('svc.goServices')} onPress={() => router.replace('/my-services')} />
        </View>
      </Screen>
    );
  }

  const dots = (
    <View accessibilityRole="progressbar" style={styles.dots}>
      {steps.map((s, i) => (
        <View key={s} style={[styles.dot, i === idx ? { width: 26, backgroundColor: theme.ink } : { width: 8, backgroundColor: i < idx ? theme.ink : theme.fill }]} />
      ))}
    </View>
  );

  const footer = (
    <View style={{ gap: 8 }}>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={next} style={[styles.cta, { backgroundColor: theme.ink, opacity: saving ? 0.6 : 1 }]}>
        <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>{isLast ? t(id ? 'svc.save' : 'svc.publish') : t('svc.continue')}</Text>
      </Pressable>
    </View>
  );

  const kinds: { k: Kind; emoji: string; a: string; b: string }[] = [
    { k: 'slot', emoji: 'books', a: t('svc.typeSlot'), b: t('svc.typeSlotSub') },
    { k: 'per_minute', emoji: 'stopwatch', a: t('svc.typeCall'), b: t('svc.typeCallSub') },
    { k: 'package', emoji: 'sparkles', a: t('svc.typePackage'), b: t('svc.typePackageSub') },
  ];

  return (
    <Screen footer={footer}>
      <View style={styles.top}>
        {idx === 0 && !id ? (
          <Pressable accessibilityRole="button" onPress={back} style={[styles.pill, { backgroundColor: theme.surface }]}>
            <Text style={[styles.pillText, { color: theme.text }]}>{t('common.cancel')}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back} style={[styles.round44, { backgroundColor: theme.surface }]}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
        )}
        {dots}
      </View>

      {step === 'type' ? (
        <>
          <Text style={[styles.h1, { color: theme.text, fontSize: 36 }]}>{t('svc.typeTitle')}</Text>
          <View style={{ gap: 10 }} accessibilityRole="radiogroup">
            {kinds.map((x) => {
              const on = kind === x.k;
              return (
                <Pressable key={x.k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setKind(x.k)} style={[styles.kind, { backgroundColor: on ? theme.accent : theme.surface }]}>
                  <View style={[styles.round56, { backgroundColor: theme.surface }]}><Emoji name={x.emoji} size={34} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.kindTitle, { color: on ? theme.onAccent : theme.text }]}>{x.a}</Text>
                    <Text style={[styles.kindSub, { color: on ? theme.onAccent : theme.muted }]}>{x.b}</Text>
                  </View>
                  <View style={[styles.radio, on ? { borderColor: theme.ink, backgroundColor: theme.ink } : { borderColor: theme.fill }]}>
                    {on ? <View style={[styles.radioIn, { backgroundColor: theme.accent }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {step === 'details' ? (
        <>
          <Text style={[styles.h1, { color: theme.text }]}>{t('svc.detailsTitle')}</Text>
          {userId ? <PhotosSection serviceId={id ?? null} userId={userId} draft={draftPhotos} onDraftChange={setDraftPhotos} /> : null}
          <View style={[styles.card, { backgroundColor: theme.surface, paddingVertical: 6 }]}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.muted }]}>{t('svc.fieldTitle')}</Text>
              <TextInput value={title} onChangeText={setTitle} maxLength={80} style={[styles.inputTitle, { color: theme.text }]} placeholderTextColor={theme.muted} />
            </View>
            <View style={[styles.field, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
              <Text style={[styles.label, { color: theme.muted }]}>{t('svc.fieldDescription')}</Text>
              <TextInput value={description} onChangeText={setDescription} multiline maxLength={500} style={[styles.inputDesc, { color: theme.text }]} placeholderTextColor={theme.muted} />
            </View>
          </View>
          {kind === 'per_minute' ? (
            <View style={[styles.tile, { backgroundColor: theme.accent }]}>
              <Text style={[styles.label, { color: theme.onAccent }]}>{t('svc.fieldRate')}</Text>
              <View style={styles.priceRow}>
                <TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" style={[styles.priceInput, { color: theme.onAccent }]} placeholder="0,00" placeholderTextColor={theme.onAccent} />
                <Text style={[styles.priceInput, { color: theme.onAccent }]}>€</Text>
              </View>
              <Text style={[styles.rowSub, { color: theme.onAccent }]}>{t('calls.rateHint')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.two}>
                <View style={[styles.tile, { backgroundColor: theme.surface, flex: 1 }]}>
                  <Text style={[styles.label, { color: theme.muted }]}>{t(kind === 'package' ? 'svc.fieldDurationEach' : 'svc.fieldDuration')}</Text>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="-15" onPress={() => setDuration((d) => Math.max(5, d <= 15 ? 5 : d - 15))} style={[styles.stepBtn, { backgroundColor: theme.bg }]}><Text style={[styles.stepTxt, { color: theme.text }]}>−</Text></Pressable>
                    <Text style={[styles.big, { color: theme.text }]}>{`${duration}'`}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="+15" onPress={() => setDuration((d) => Math.min(480, d === 5 ? 15 : d + 15))} style={[styles.stepBtn, { backgroundColor: theme.bg }]}><Text style={[styles.stepTxt, { color: theme.text }]}>+</Text></Pressable>
                  </View>
                </View>
                <View style={[styles.tile, { backgroundColor: theme.accent, flex: 1 }]}>
                  <Text style={[styles.label, { color: theme.onAccent }]}>{t(kind === 'package' ? 'svc.fieldPackagePrice' : 'svc.fieldPrice')}</Text>
                  <View style={styles.priceRow}>
                    <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={[styles.priceInput, { color: theme.onAccent }]} placeholder="0" placeholderTextColor={theme.onAccent} />
                    <Text style={[styles.priceInput, { color: theme.onAccent }]}>€</Text>
                  </View>
                </View>
              </View>
              {kind === 'package' ? (
                <View style={[styles.tile, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.label, { color: theme.muted }]}>{t('svc.fieldSessions')}</Text>
                  <View style={styles.stepper}>
                    <Pressable accessibilityRole="button" accessibilityLabel="-1" onPress={() => setSessions((s) => Math.max(2, s - 1))} style={[styles.stepBtn, { backgroundColor: theme.bg }]}><Text style={[styles.stepTxt, { color: theme.text }]}>−</Text></Pressable>
                    <Text style={[styles.big, { color: theme.text }]}>{sessions}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="+1" onPress={() => setSessions((s) => Math.min(50, s + 1))} style={[styles.stepBtn, { backgroundColor: theme.bg }]}><Text style={[styles.stepTxt, { color: theme.text }]}>+</Text></Pressable>
                  </View>
                  <Text style={[styles.rowSub, { color: theme.muted }]}>{t('myServices.packagePriceHint')}</Text>
                </View>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {step === 'where' ? (
        <>
          <Text style={[styles.h1, { color: theme.text }]}>{t('svc.whereTitle')}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, padding: 6 }]}>
            {PLACES.map((p) => {
              const on = places.includes(p);
              const sub = p === 'online' ? t('svc.placeOnlineSub') : p === 'sede' ? t('svc.placeSedeSub') : t('svc.placeHomeSub');
              return (
                <Pressable key={p} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPlaces((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))} style={[styles.placeRow, on && { backgroundColor: theme.bg }]}>
                  <View style={[styles.icon40, { backgroundColor: on ? theme.surface : theme.bg }]}><Ionicons name={PLACE_ICON[p]} size={20} color={theme.ink} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{t(`svc.place_${p}`)}</Text>
                    <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text>
                  </View>
                  <View style={[styles.check, on ? { backgroundColor: theme.ink, borderColor: theme.ink } : { borderColor: theme.fill }]}>
                    {on ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {places.includes('sede') ? (
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Text style={[styles.label, { color: theme.muted }]}>{t('svc.spaceFee')}</Text>
              <TextInput value={spaceFee} onChangeText={setSpaceFee} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.muted} style={[styles.inputTitle, { color: theme.text }]} />
              <Text style={[styles.rowSub, { color: theme.muted }]}>{t('myServices.spaceFeeHint')}</Text>
            </View>
          ) : null}
          {IncludesCard()}
        </>
      ) : null}

      {step === 'include' ? (
        <>
          <Text style={[styles.h1, { color: theme.text }]}>{t('svc.includesTitle')}</Text>
          {IncludesCard()}
        </>
      ) : null}

      {step === 'rules' ? (
        <>
          <Text style={[styles.h1, { color: theme.text }]}>{t('svc.rulesTitle')}</Text>
          <View style={[styles.seg, { backgroundColor: theme.surface }]} accessibilityRole="radiogroup">
            {[false, true].map((c) => (
              <Pressable key={String(c)} accessibilityRole="radio" accessibilityState={{ selected: custom === c }} onPress={() => setCustom(c)} style={[styles.segBtn, { backgroundColor: custom === c ? theme.ink : 'transparent' }]}>
                <Text style={[styles.segText, { color: custom === c ? '#FFFFFF' : theme.text }]}>{c ? t('svc.rulesOnly') : t('svc.rulesUsual')}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {custom ? (
              <>
                <Text style={[styles.rowSub, { color: theme.muted }]}>{t('myServices.startFrom')}</Text>
                <View style={styles.chips}>
                  {[...policies.map((p) => ({ key: p.id, name: p.name, tiers: p.tiers })), { key: 'standard', name: t('policy.standardName'), tiers: STANDARD_TIERS }].map((p) => (
                    <Pressable key={p.key} accessibilityRole="button" onPress={() => setRows(toRows(p.tiers))} style={[styles.chipSm, { backgroundColor: theme.bg }]}>
                      <Text style={[styles.chipSmText, { color: theme.text }]}>{p.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <TierEditor rows={rows} onChange={setRows} />
              </>
            ) : (
              <>
                <Text style={[styles.rowSub, { color: theme.muted }]}>{defaultPolicy ? t('myServices.policyDefaultNamed', { name: defaultPolicy.name }) : t('myServices.policyDefaultStandard')}</Text>
                <TierLines tiers={defaultTiers} />
              </>
            )}
          </View>
          <View style={styles.tip}>
            <Emoji name="light_bulb" size={22} />
            <Text style={[styles.tipText, { color: theme.muted }]}>{t('svc.rulesTip')}</Text>
          </View>
        </>
      ) : null}

      {step === 'when' ? (
        <>
          <Text style={[styles.h1, { color: theme.text }]}>{t('svc.whenTitle')}</Text>
          {availability.loaded ? (
            <>
              {[false, true].map((sp) => {
                const on = availability.specific === sp;
                return (
                  <Pressable
                    key={String(sp)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      if (sp && !availability.specific) void availability.startSpecific();
                      if (!sp && availability.specific) { availability.setSpecific(false); availability.setDraft(null); }
                    }}
                    style={[styles.radioCard, { backgroundColor: on ? theme.accent : theme.surface }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: on ? theme.onAccent : theme.text, fontSize: 17 }]}>{sp ? t('svc.whenOnly') : t('svc.whenUsual')}</Text>
                      <Text style={[styles.rowSub, { color: on ? theme.onAccent : theme.muted }]}>{sp ? t('svc.whenOnlySub') : t('svc.whenUsualSub')}</Text>
                    </View>
                    <View style={[styles.radio, on ? { borderColor: theme.ink, backgroundColor: theme.ink } : { borderColor: theme.fill }]}>
                      {on ? <View style={[styles.radioIn, { backgroundColor: theme.accent }]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
              {availability.specific && availability.draft ? <AvailabilityPanel draft={availability.draft} onChange={availability.setDraft} errors={availability.errors} /> : null}
              {WeekPreview(availability.specific && availability.draft ? availability.draft : general)}
            </>
          ) : null}
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={() => setActive((v) => !v)} style={[styles.card, styles.switchRow, { backgroundColor: theme.surface }]}>
            <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]}>{t('myServices.activeLabel')}</Text>
            <View style={[styles.track, { backgroundColor: active ? theme.ink : theme.fill, alignItems: active ? 'flex-end' : 'flex-start' }]}>
              <View style={[styles.thumb, { backgroundColor: active ? theme.accent : theme.surface }]} />
            </View>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );

  function WeekPreview(src: ScheduleDraft | null) {
    if (!src) return null;
    const FROM = 8 * 60;
    const SPAN = 14 * 60;
    const letters = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <Text style={[styles.rowTitle, { color: theme.text, fontSize: 15 }]}>{t('svc.weekPreview')}</Text>
        <View style={styles.week} accessibilityLabel={t('svc.weekPreview')}>
          {src.days.map((d, i) => (
            <View key={i} style={styles.weekCol}>
              <View style={[styles.weekBar, { backgroundColor: theme.bg }]}>
                {d.active
                  ? d.ranges.map((r, j) => {
                      const a = Math.max(FROM, toMinutes(r.start));
                      const b = Math.min(FROM + SPAN, toMinutes(r.end));
                      if (!(b > a)) return null;
                      return <View key={j} style={[styles.weekSeg, { backgroundColor: theme.ink, top: `${((a - FROM) / SPAN) * 100}%`, height: `${((b - a) / SPAN) * 100}%` }]} />;
                    })
                  : null}
              </View>
              <Text style={[styles.weekLetter, { color: theme.text }]}>{letters[i]}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function IncludesCard() {
    const add = () => {
      const v = newInclude.trim().slice(0, 80);
      if (!v || includes.length >= 8) return;
      setIncludes([...includes, v]);
      setNewInclude('');
    };
    return (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('svc.includes')}</Text>
          <Text style={[styles.rowSub, { color: theme.muted }]}>{t('svc.includesCount', { n: includes.length })}</Text>
        </View>
        <View style={styles.chips}>
          {includes.map((x, i) => (
            <Pressable key={x + i} accessibilityRole="button" onPress={() => setIncludes(includes.filter((_, j) => j !== i))} style={[styles.chipSm, { backgroundColor: theme.bg }]}>
              <Text style={[styles.chipSmText, { color: theme.text }]}>{`${x} ✕`}</Text>
            </Pressable>
          ))}
        </View>
        {includes.length < 8 ? (
          <View style={[styles.addRow, { backgroundColor: theme.bg }]}>
            <TextInput value={newInclude} onChangeText={setNewInclude} onSubmitEditing={add} returnKeyType="done" placeholder={t('svc.includesPlaceholder')} placeholderTextColor={theme.muted} maxLength={80} style={[styles.addInput, { color: theme.text }]} />
            <Pressable accessibilityRole="button" onPress={add} style={[styles.copy, { backgroundColor: theme.ink }]}><Text style={[styles.copyText, { color: '#FFFFFF' }]}>{t('svc.add')}</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { height: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontFamily: fonts.medium, fontSize: 15 },
  round44: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  round56: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  icon40: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  h1: { fontFamily: fonts.semibold, fontSize: 32, letterSpacing: -1.4, lineHeight: 34 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 30 },
  kindTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  kindSub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioIn: { width: 10, height: 10, borderRadius: 5 },
  card: { borderRadius: 28, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  field: { paddingVertical: 10, gap: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 12 },
  inputTitle: { fontFamily: fonts.semibold, fontSize: 17, padding: 0 },
  inputDesc: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, minHeight: 64, padding: 0, textAlignVertical: 'top' },
  two: { flexDirection: 'row', gap: 8 },
  tile: { borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontFamily: fonts.regular, fontSize: 20 },
  big: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: -1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceInput: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: -1, padding: 0, minWidth: 40 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 22 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowSub: { fontFamily: fonts.regular, fontSize: 13 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipSm: { height: 38, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  chipSmText: { fontFamily: fonts.semibold, fontSize: 14 },
  addRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingLeft: 16, paddingRight: 4, height: 50 },
  addInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, padding: 0 },
  copy: { height: 42, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  copyText: { fontFamily: fonts.semibold, fontSize: 14 },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  segBtn: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fonts.semibold, fontSize: 15 },
  tip: { flexDirection: 'row', gap: 10, paddingHorizontal: 6, alignItems: 'flex-start' },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  radioCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 28 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { width: 52, height: 32, borderRadius: 999, padding: 3, justifyContent: 'center' },
  thumb: { width: 26, height: 26, borderRadius: 13 },
  cta: { height: 60, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.semibold, fontSize: 17 },
  doneHero: { margin: 8, borderRadius: 40, padding: 22, paddingTop: 56, gap: 24 },
  doneTitle: { fontFamily: fonts.semibold, fontSize: 40, letterSpacing: -2, lineHeight: 40 },
  doneCard: { borderRadius: 28, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  donePrice: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  body: { paddingHorizontal: 16, gap: 10 },
  linkBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 16, paddingRight: 6, borderRadius: 999 },
  linkText: { flex: 1, fontFamily: fonts.regular, fontSize: 15 },
  week: { flexDirection: 'row', gap: 5, height: 140 },
  weekCol: { flex: 1, gap: 4 },
  weekBar: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  weekSeg: { position: 'absolute', left: 3, right: 3, borderRadius: 8 },
  weekLetter: { fontFamily: fonts.semibold, fontSize: 11, textAlign: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12 },
});
