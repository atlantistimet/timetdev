import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { ErrorText, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { MAX_TAGS, createPost, profilesByHandles, searchPeople, type PersonHit } from '@/lib/feed';
import { MAX_MEDIA, mediaUrl, pickAndUpload, removeFiles, type MediaItem } from '@/lib/media';
import { listMyServices, type MyService } from '@/lib/my-services';
import { finalPriceCents, listMyOffers, type Offer } from '@/lib/offers';
import { rememberCreating, takeCreating } from '@/lib/post-link-draft';
import { loadReviews, stars, type Review } from '@/lib/reviews';
import { listMyLinks, type SlotLink } from '@/lib/slot-links';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

type Attach = { kind: 'service' | 'offer' | 'slot'; id: string; title: string; sub: string; emoji: string };
type Lists = { services: MyService[]; offers: Offer[]; links: SlotLink[]; reviews: Review[] };

const MENTION_AT_CURSOR = /(^|\s)@([a-z0-9_.]{0,30})$/;

export default function NewPostScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const params = useLocalSearchParams<{ serviceId?: string }>();
  const [body, setBody] = useState('');
  const [cursor, setCursor] = useState(0);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [attach, setAttach] = useState<Attach | null>(null);
  const [lists, setLists] = useState<Lists>({ services: [], offers: [], links: [], reviews: [] });
  const [sheet, setSheet] = useState<'review' | 'promote' | 'service' | 'offer' | 'slot' | 'collab' | null>(null);
  const [collabs, setCollabs] = useState<PersonHit[]>([]);
  const [collabQuery, setCollabQuery] = useState('');
  const [collabHits, setCollabHits] = useState<PersonHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const prefilled = useRef(false);

  const asServiceAttach = useCallback((s: MyService): Attach => ({ kind: 'service', id: s.id, title: s.title, emoji: s.kind === 'per_minute' ? 'telephone_receiver' : s.kind === 'package' ? 'gift' : 'books', sub: s.kind === 'per_minute' ? `${formatEuro(s.rate_cents_per_min ?? 0, i18n.language)}/min` : `${formatEuro(s.price_cents ?? 0, i18n.language)}${s.duration_min ? ` · ${s.duration_min} min` : ''}` }), [i18n.language]);
  const asOfferAttach = useCallback((o: Offer): Attach => ({ kind: 'offer', id: o.id, title: o.service_title, emoji: 'party_popper', sub: `${formatEuro(finalPriceCents(o), i18n.language)} · ${o.duration_min} min${o.discount_pct ? ` · -${o.discount_pct}%` : ''}` }), [i18n.language]);
  const asLinkAttach = useCallback((l: SlotLink): Attach => ({ kind: 'slot', id: l.id, title: l.service_title || t('feed.kind.slots'), emoji: 'stopwatch', sub: `${formatEuro(l.price_cents, i18n.language)} · ${l.duration_min} min` }), [i18n.language, t]);

  // elenchi dei miei collegamenti, riletti ogni volta che si torna qui (dopo "Crea nuovo")
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      (async () => {
        const nowMs = Date.now();
        const [s, o, l, r, used] = await Promise.all([
          listMyServices(userId, ['slot', 'package', 'per_minute']),
          listMyOffers(userId),
          listMyLinks(userId),
          loadReviews(userId),
          supabase.from('posts').select('review_id').eq('author_id', userId).not('review_id', 'is', null).is('deleted_at', null),
        ]);
        if (!alive) return;
        const usedIds = new Set(((used.data ?? []) as { review_id: string }[]).map((x) => x.review_id));
        const next: Lists = {
          services: s.services.filter((x) => x.active),
          offers: o.offers.filter((x) => x.active),
          links: l.links.filter((x) => !x.expires_at || new Date(x.expires_at).getTime() > nowMs),
          reviews: r.reviews.filter((x) => !usedIds.has(x.id)),
        };
        setLists(next);
        const c = takeCreating();
        if (c) {
          const fresh = c.kind === 'service' ? next.services.find((x) => !c.before.has(x.id)) : c.kind === 'offer' ? next.offers.find((x) => !c.before.has(x.id)) : next.links.find((x) => !c.before.has(x.id));
          if (fresh) setAttach(c.kind === 'service' ? asServiceAttach(fresh as MyService) : c.kind === 'offer' ? asOfferAttach(fresh as Offer) : asLinkAttach(fresh as SlotLink));
        } else if (params.serviceId && !prefilled.current) {
          prefilled.current = true;
          const sv = next.services.find((x) => x.id === params.serviceId);
          if (sv) setAttach(asServiceAttach(sv));
        }
      })();
      return () => {
        alive = false;
      };
    }, [userId, params.serviceId, asServiceAttach, asOfferAttach, asLinkAttach]),
  );

  // @menzioni: suggerimenti mentre si scrive
  const before = body.slice(0, cursor);
  const mention = MENTION_AT_CURSOR.exec(before);
  const query = mention ? mention[2] : null;
  useEffect(() => {
    if (!userId || query === null || query.length < 1) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(query, userId, 1).then((r) => {
        if (alive) setPeople(r.filter((p) => p.handle));
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, userId]);
  const suggestions = query !== null && query.length >= 1 ? people : [];

  // collaboratori: ricerca per nome o @handle nel foglio "Collabora"
  const collabText = collabQuery.trim().replace(/^@/, '');
  useEffect(() => {
    if (!userId || collabText.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(collabText, userId, 2).then((r) => {
        if (alive) setCollabHits(r);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [collabText, userId]);
  const shownHits = collabText.length >= 2 ? collabHits.filter((h) => !collabs.some((c) => c.id === h.id)) : [];

  const pickPerson = (p: PersonHit) => {
    if (!mention || !p.handle) return;
    const start = before.length - mention[0].length + mention[1].length;
    const text = `${body.slice(0, start)}@${p.handle} ${body.slice(cursor)}`;
    setBody(text);
    setCursor(start + p.handle.length + 2);
    setPeople([]);
  };

  const addMedia = async () => {
    if (!userId || busy || media.length >= MAX_MEDIA) return;
    setBusy(true);
    setErrorKey(null);
    const r = await pickAndUpload('media', userId);
    setBusy(false);
    if (r.errorKey) setErrorKey(r.errorKey);
    if (r.item) setMedia((m) => [...m, r.item!]);
  };
  const removeMedia = async (m: MediaItem) => {
    setMedia((l) => l.filter((x) => x.path !== m.path));
    await removeFiles('media', [m.path]);
  };

  const createNew = (kind: Attach['kind']) => {
    rememberCreating(kind, (kind === 'service' ? lists.services : kind === 'offer' ? lists.offers : lists.links).map((x) => x.id));
    setSheet(null);
    router.push(kind === 'service' ? '/service-edit' : kind === 'offer' ? '/offer-edit' : '/slot-link-edit');
  };

  const publish = async () => {
    if (!userId || saving) return;
    if (!body.trim() && media.length === 0 && !attach && !review) return setErrorKey('feed.errors.empty');
    setSaving(true);
    setErrorKey(null);
    const handles = Array.from(new Set((body.match(/@[a-z0-9_.]{3,30}/g) ?? []).map((h) => h.slice(1).replace(/\.+$/, ''))));
    const found = (await profilesByHandles(handles)).filter((p) => p.id !== userId);
    if (found.length > MAX_TAGS) {
      setSaving(false);
      return setErrorKey('feed.errors.maxTags');
    }
    const kind = attach?.kind === 'offer' ? 'offer' : attach?.kind === 'slot' ? 'slots' : 'update';
    const r = await createPost({
      authorId: userId,
      kind,
      body,
      lang: i18n.language,
      media,
      offerId: attach?.kind === 'offer' ? attach.id : undefined,
      slotLinkId: attach?.kind === 'slot' ? attach.id : undefined,
      serviceId: attach?.kind === 'service' ? attach.id : undefined,
      reviewId: review?.id,
      tagIds: found.filter((p) => !collabs.some((c) => c.id === p.id)).map((p) => p.id),
      collabIds: collabs.map((c) => c.id),
    });
    setSaving(false);
    if (r.errorKey) setErrorKey(r.errorKey);
    else router.replace('/');
  };

  const section = (title: string, emoji: string, items: { id: string; title: string; sub: string; on: boolean; press: () => void }[], newLabel: string | null, onNew: (() => void) | null, empty: string) => (
    <View style={{ gap: 8 }}>
      <View style={styles.secHead}>
        <Emoji name={emoji} size={22} />
        <Text style={[styles.secTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {items.length === 0 ? <Text style={[styles.sub, { color: theme.muted }]}>{empty}</Text> : null}
      {items.map((x) => (
        <Pressable key={x.id} accessibilityRole="radio" accessibilityState={{ selected: x.on }} onPress={x.press} style={[styles.pick, { backgroundColor: x.on ? theme.ink : theme.bg }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.pickTitle, { color: x.on ? '#FFFFFF' : theme.text }]}>{x.title}</Text>
            <Text numberOfLines={1} style={[styles.sub, { color: x.on ? theme.inkMuted : theme.muted }]}>{x.sub}</Text>
          </View>
          {x.on ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
        </Pressable>
      ))}
      {newLabel && onNew ? (
        <Pressable accessibilityRole="button" onPress={onNew} style={[styles.pick, styles.newBtn, { borderColor: theme.muted }]}>
          <Ionicons name="add" size={20} color={theme.text} />
          <Text style={[styles.pickTitle, { color: theme.text }]}>{newLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.pill, { backgroundColor: theme.surface }]}>
          <Text style={[styles.pillText, { color: theme.text }]}>{t('feed.cancel')}</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: theme.text }]}>{t('feed.newTitle')}</Text>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void publish()} style={[styles.pill, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}>
          <Text style={[styles.pillText, { color: theme.onAccent, fontFamily: fonts.semibold }]}>{t('feed.publish')}</Text>
        </Pressable>
      </View>

      <View style={{ height: 8 }} />

      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel={t('feed.bodyLabel')}
          value={body}
          onChangeText={setBody}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.start)}
          multiline
          maxLength={2000}
          placeholder={t('feed.bodyPlaceholder')}
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text }]}
        />
        {suggestions.length > 0 ? (
          <View style={[styles.suggest, { backgroundColor: theme.bg }]}>
            {suggestions.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" onPress={() => pickPerson(p)} style={styles.person}>
                <Avatar name={p.full_name} seed={p.id} size={34} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.pickTitle, { color: theme.text }]}>{p.full_name}</Text>
                  <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{`@${p.handle}`}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={[styles.hintTxt, { color: theme.muted }]}>{t('feed.mentionHint')}</Text>
      </View>

      <View style={[styles.grid, { backgroundColor: theme.surface }]}>
        {([
          ['photo', 'image-outline', t('feed.btnPhoto'), media.length > 0],
          ['review', 'star-outline', t('feed.btnReview'), !!review],
          ['promote', 'megaphone-outline', t('feed.btnPromote'), !!attach],
          ['collab', 'people-outline', t('feed.btnCollab'), collabs.length > 0],
        ] as const).map(([k, icon, label, on]) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            disabled={k === 'photo' && (busy || media.length >= MAX_MEDIA)}
            onPress={() => (k === 'photo' ? void addMedia() : setSheet(k))}
            haptic="light"
            style={styles.gridItem}
          >
            <View style={[styles.gridCircle, { backgroundColor: on ? theme.accent : theme.bg }]}>
              {k === 'photo' && busy ? <ActivityIndicator color={theme.text} /> : <Ionicons name={icon} size={24} color={on ? theme.onAccent : theme.ink} />}
            </View>
            <Text style={[styles.gridLabel, { color: theme.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {review || attach || collabs.length > 0 ? (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        {review ? (
          <View style={[styles.chosen, { backgroundColor: theme.bg }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pickTitle, { color: theme.text }]}>{stars(review.rating)}</Text>
              <Text numberOfLines={2} style={[styles.sub, { color: theme.muted }]}>{review.body ? `“${review.body}”` : t('feed.reviewNoText')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => setReview(null)}><Ionicons name="close-circle" size={24} color={theme.muted} /></Pressable>
          </View>
        ) : null}
        {attach ? (
          <View style={[styles.chosen, { backgroundColor: theme.accent }]}>
            <View style={[styles.iconDot, { backgroundColor: theme.surface }]}><Emoji name={attach.emoji} size={24} /></View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.pickTitle, { color: theme.onAccent }]}>{attach.title}</Text>
              <Text numberOfLines={1} style={[styles.sub, { color: theme.onAccent }]}>{attach.sub}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => setAttach(null)}><Ionicons name="close-circle" size={24} color={theme.ink} /></Pressable>
          </View>
        ) : null}
        {collabs.map((c) => (
          <View key={c.id} style={[styles.chosen, { backgroundColor: theme.bg }]}>
            <Avatar name={c.full_name} seed={c.id} size={36} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.pickTitle, { color: theme.text }]}>{t('feed.collabWith', { name: c.full_name })}</Text>
              <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{t('feed.collabPending')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => setCollabs((l) => l.filter((x) => x.id !== c.id))}><Ionicons name="close-circle" size={24} color={theme.muted} /></Pressable>
          </View>
        ))}
      </View>
      ) : null}

      {media.length > 0 ? (
      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {media.map((m) => (
            <View key={m.path}>
              {m.type === 'video' ? (
                <View style={[styles.tile, styles.center, { backgroundColor: theme.fill }]}><Ionicons name="play" size={26} color={theme.text} /></View>
              ) : (
                <Image source={{ uri: mediaUrl('media', m.path) }} style={[styles.tile, { backgroundColor: theme.fill }]} />
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={t('media.remove')} onPress={() => void removeMedia(m)} style={[styles.remove, { backgroundColor: theme.glass }]}>
                <Ionicons name="close" size={16} color={theme.text} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </View>
      ) : null}

      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}

      <SheetModal visible={sheet !== null}  onRequestClose={() => setSheet(null)}>
        <Pressable style={[styles.backdrop]} onPress={() => setSheet(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          <Text style={[styles.topTitle, { color: theme.text, fontSize: 20 }]}>{sheet === 'review' ? t('feed.secReview') : sheet === 'promote' ? t('feed.promoteTitle') : sheet === 'collab' ? t('feed.collabTitle') : sheet === 'service' ? t('feed.secServices') : sheet === 'offer' ? t('feed.secOffers') : t('feed.secSlots')}</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 12 }}>
            {sheet === 'promote' ? (
              <View>
                {([
                  ['service', 'briefcase-outline', t('feed.promoteService'), t('feed.promoteServiceSub')],
                  ['offer', 'gift-outline', t('feed.promoteOffer'), t('feed.promoteOfferSub')],
                  ['slot', 'flash-outline', t('feed.promoteSlot'), t('feed.promoteSlotSub')],
                ] as const).map(([k, icon, title, sub]) => (
                  <Pressable key={k} accessibilityRole="button" onPress={() => setSheet(k)} style={styles.promoRow}>
                    <View style={[styles.gridCircle, { backgroundColor: theme.bg, width: 44, height: 44 }]}><Ionicons name={icon} size={20} color={theme.ink} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickTitle, { color: theme.text }]}>{title}</Text>
                      <Text style={[styles.sub, { color: theme.muted }]}>{sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {sheet === 'collab' ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  accessibilityLabel={t('feed.collabSearch')}
                  value={collabQuery}
                  onChangeText={setCollabQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t('feed.collabSearch')}
                  placeholderTextColor={theme.muted}
                  style={[styles.search, { backgroundColor: theme.bg, color: theme.text }]}
                />
                <Text style={[styles.sub, { color: theme.muted }]}>{collabs.length >= MAX_TAGS ? t('feed.collabMax', { count: MAX_TAGS }) : t('feed.collabHint')}</Text>
                {collabs.length < MAX_TAGS ? shownHits.map((p) => (
                  <Pressable key={p.id} accessibilityRole="button" onPress={() => { setCollabs((l) => [...l, p]); setCollabQuery(''); setCollabHits([]); setSheet(null); }} style={styles.person}>
                    <Avatar name={p.full_name} seed={p.id} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={[styles.pickTitle, { color: theme.text }]}>{p.full_name}</Text>
                      {p.handle ? <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{`@${p.handle}`}</Text> : null}
                    </View>
                  </Pressable>
                )) : null}
              </View>
            ) : null}
            {sheet === 'review' ? section(t('feed.secReview'), 'star', lists.reviews.map((r) => ({ id: r.id, title: stars(r.rating), sub: r.body ?? t('feed.reviewNoText'), on: review?.id === r.id, press: () => { setReview(review?.id === r.id ? null : r); setSheet(null); } })), null, null, t('feed.noReviews')) : null}
            {sheet === 'service' ? section(t('feed.secServices'), 'books', lists.services.map((sv) => { const a = asServiceAttach(sv); return { id: sv.id, title: a.title, sub: a.sub, on: attach?.id === sv.id, press: () => { setAttach(attach?.id === sv.id ? null : a); setSheet(null); } }; }), t('feed.newService'), () => createNew('service'), t('feed.noServices')) : null}
            {sheet === 'offer' ? section(t('feed.secOffers'), 'party_popper', lists.offers.map((o) => { const a = asOfferAttach(o); return { id: o.id, title: a.title, sub: a.sub, on: attach?.id === o.id, press: () => { setAttach(attach?.id === o.id ? null : a); setSheet(null); } }; }), t('feed.newOffer'), () => createNew('offer'), t('feed.noOffers')) : null}
            {sheet === 'slot' ? section(t('feed.secSlots'), 'stopwatch', lists.links.map((l) => { const a = asLinkAttach(l); return { id: l.id, title: a.title, sub: a.sub, on: attach?.id === l.id, press: () => { setAttach(attach?.id === l.id ? null : a); setSheet(null); } }; }), t('feed.newSlot'), () => createNew('slot'), t('feed.noLinks')) : null}
          </ScrollView>
        </View>
      </SheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  pill: { height: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontFamily: fonts.medium, fontSize: 15 },
  card: { borderRadius: 32, padding: 16, gap: 14, marginBottom: 16 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  input: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 25, minHeight: 120, padding: 0, textAlignVertical: 'top' },
  hintTxt: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  suggest: { borderRadius: 22, padding: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  tile: { width: 92, height: 92, borderRadius: 24 },
  center: { alignItems: 'center', justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', gap: 4 },
  remove: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, padding: 12 },
  iconDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grid: { borderRadius: 32, paddingVertical: 16, paddingHorizontal: 6, flexDirection: 'row', marginBottom: 16 },
  gridItem: { flex: 1, alignItems: 'center', gap: 6 },
  gridCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontFamily: fonts.medium, fontSize: 12, textAlign: 'center' },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  search: { height: 48, borderRadius: 999, paddingHorizontal: 18, fontFamily: fonts.regular, fontSize: 16 },
  addLink: { height: 50, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sub: { fontFamily: fonts.regular, fontSize: 13 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 30, gap: 12 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  pick: { borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  newBtn: { borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center' },
});
