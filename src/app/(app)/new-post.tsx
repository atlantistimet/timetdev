import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { MediaPicker } from '@/components/MediaView';
import { ErrorText, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { MAX_TAGS, createPost, searchPeople, type PersonHit, type PostKind } from '@/lib/feed';
import { type MediaItem } from '@/lib/media';
import { listMyServices, type MyService } from '@/lib/my-services';
import { finalPriceCents, listMyOffers, type Offer } from '@/lib/offers';
import { listMyLinks, type SlotLink } from '@/lib/slot-links';
import { fonts, useTheme } from '@/theme';

export default function NewPostScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [kind, setKind] = useState<PostKind>('update');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [tagged, setTagged] = useState<PersonHit[]>([]);
  const [tagging, setTagging] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [services, setServices] = useState<MyService[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [links, setLinks] = useState<SlotLink[]>([]);
  const [linkService, setLinkService] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [s, o, l] = await Promise.all([listMyServices(userId), listMyOffers(userId), listMyLinks(userId)]);
      if (!alive) return;
      setServices(s.services.filter((x) => x.active));
      setOffers(o.offers.filter((x) => x.active));
      setLinks(l.links);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || search.trim().length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchPeople(search, userId).then((r) => {
        if (alive) setHits(r);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, userId]);

  const shownHits = search.trim().length < 2 ? [] : hits.filter((h) => !tagged.some((x) => x.id === h.id));
  const euro = (c: number) => formatEuro(c, i18n.language);

  const publish = async () => {
    if (!userId) return;
    if (kind === 'offer' && !offerId) return setErrorKey('feed.errors.pickOffer');
    if (kind === 'slots' && !linkId) return setErrorKey('feed.errors.pickLink');
    if (kind === 'update' && !body.trim() && media.length === 0) return setErrorKey('feed.errors.empty');
    setSaving(true);
    setErrorKey(null);
    const r = await createPost({
      authorId: userId,
      kind,
      body,
      lang: i18n.language,
      media: kind === 'update' ? media : [],
      offerId: kind === 'offer' ? offerId ?? undefined : undefined,
      slotLinkId: kind === 'slots' ? linkId ?? undefined : undefined,
      serviceId: kind === 'update' && linkService ? serviceId ?? undefined : undefined,
      tagIds: kind === 'update' ? tagged.map((x) => x.id) : [],
    });
    setSaving(false);
    if (r.errorKey) setErrorKey(r.errorKey);
    else router.replace('/');
  };

  const types: { k: PostKind; emoji: string; label: string }[] = [
    { k: 'update', emoji: 'sparkles', label: t('feed.kindUpdate') },
    { k: 'offer', emoji: 'party_popper', label: t('feed.kindOffer') },
    { k: 'slots', emoji: 'stopwatch', label: t('feed.kindSlots') },
  ];
  const pickRow = (id: string, title: string, sub: string, on: boolean, press: () => void) => (
    <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={press} style={[styles.pick, { backgroundColor: on ? theme.ink : theme.bg }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pickTitle, { color: on ? '#FFFFFF' : theme.text }]}>{title}</Text>
        <Text style={[styles.pickSub, { color: on ? theme.inkMuted : theme.muted }]}>{sub}</Text>
      </View>
    </Pressable>
  );
  const linked = services.find((s) => s.id === serviceId) ?? null;

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={[styles.pill, { backgroundColor: theme.surface }]}>
          <Text style={[styles.pillText, { color: theme.text }]}>{t('feed.cancel')}</Text>
        </Pressable>
        <Text style={[styles.topTitle, { color: theme.text }]}>{t('feed.newTitle')}</Text>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void publish()} style={[styles.pill, { backgroundColor: theme.accent, opacity: saving ? 0.6 : 1 }]}>
          <Text style={[styles.pillText, { color: theme.onAccent, fontFamily: fonts.semibold }]}>{t('feed.publish')}</Text>
        </Pressable>
      </View>

      <View style={styles.types} accessibilityRole="radiogroup">
        {types.map((x) => {
          const on = kind === x.k;
          return (
            <Pressable key={x.k} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setKind(x.k); setErrorKey(null); }} style={[styles.type, { backgroundColor: on ? theme.ink : theme.surface }]}>
              <Emoji name={x.emoji} size={32} />
              <Text style={[styles.typeText, { color: on ? '#FFFFFF' : theme.text }]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel={t('feed.bodyLabel')}
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={2000}
          placeholder={t('feed.bodyPlaceholder')}
          placeholderTextColor={theme.muted}
          style={[styles.input, { color: theme.text }]}
        />
        {kind === 'update' && userId ? <MediaPicker items={media} onChange={setMedia} bucket="media" userId={userId} /> : null}
      </View>

      {kind === 'update' ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{t('feed.withWho')}</Text>
              <Emoji name="heart_hands" size={22} />
            </View>
            <View style={styles.chips}>
              {tagged.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => setTagged((l) => l.filter((x) => x.id !== p.id))} style={[styles.person, { backgroundColor: theme.ink }]}>
                  <Avatar name={p.full_name} seed={p.id} size={32} />
                  <Text style={[styles.personText, { color: '#FFFFFF' }]}>{p.full_name.split(' ')[0]} ✕</Text>
                </Pressable>
              ))}
              {tagged.length < MAX_TAGS ? (
                <Pressable accessibilityRole="button" onPress={() => setTagging((v) => !v)} style={[styles.person, styles.dashed, { borderColor: theme.muted, paddingLeft: 14 }]}>
                  <Text style={[styles.personText, { color: theme.text }]}>{t('feed.tagAdd')}</Text>
                </Pressable>
              ) : null}
            </View>
            {tagging && tagged.length < MAX_TAGS ? (
              <TextInput
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                placeholder={t('feed.tagSearch')}
                placeholderTextColor={theme.muted}
                style={[styles.search, { backgroundColor: theme.bg, color: theme.text }]}
              />
            ) : null}
            {shownHits.length > 0 ? (
              <View style={styles.chips}>
                {shownHits.map((p) => (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setTagged((l) => [...l, p]);
                      setSearch('');
                      setHits([]);
                      setTagging(false);
                    }}
                    style={[styles.person, { backgroundColor: theme.bg }]}
                  >
                    <Avatar name={p.full_name} seed={p.id} size={32} />
                    <Text style={[styles.personText, { color: theme.text }]}>{p.handle ? `${p.full_name} · @${p.handle}` : p.full_name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {services.length > 0 ? (
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: linkService }}
                onPress={() => {
                  setLinkService((v) => !v);
                  if (!serviceId) setServiceId(services[0].id);
                }}
                style={styles.switchRow}
              >
                <View style={[styles.sIcon, { backgroundColor: theme.bg }]}>
                  <Emoji name="books" size={26} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.text, fontSize: 15 }]}>{t('feed.linkService')}</Text>
                  <Text style={[styles.pickSub, { color: theme.muted }]}>{linked ? `${linked.title} · ${euro(linked.price_cents)}` : t('feed.linkServiceHint')}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: linkService ? theme.ink : theme.fill, alignItems: linkService ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.thumb, { backgroundColor: linkService ? theme.accent : theme.surface }]} />
                </View>
              </Pressable>
              {linkService ? <View style={{ gap: 6 }}>{services.map((s) => pickRow(s.id, s.title, euro(s.price_cents), serviceId === s.id, () => setServiceId(s.id)))}</View> : null}
            </View>
          ) : null}
        </>
      ) : null}

      {kind === 'offer' ? (
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('feed.pickOffer')}</Text>
          {offers.length === 0 ? <Text style={[styles.pickSub, { color: theme.muted }]}>{t('feed.noOffers')}</Text> : offers.map((o) => pickRow(o.id, o.service_title, `${euro(finalPriceCents(o))} · ${o.duration_min} min`, offerId === o.id, () => setOfferId(o.id)))}
          {offers.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/offer-edit')} style={[styles.pill, { backgroundColor: theme.ink, alignSelf: 'flex-start' }]}>
              <Text style={[styles.pillText, { color: '#FFFFFF' }]}>{t('feed.createOffer')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {kind === 'slots' ? (
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('feed.pickLink')}</Text>
          {links.length === 0 ? <Text style={[styles.pickSub, { color: theme.muted }]}>{t('feed.noLinks')}</Text> : links.map((l) => pickRow(l.id, l.service_title || t('feed.kindSlots'), `${euro(l.price_cents)} · ${l.duration_min} min`, linkId === l.id, () => setLinkId(l.id)))}
          {links.length === 0 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/slot-link-edit')} style={[styles.pill, { backgroundColor: theme.ink, alignSelf: 'flex-start' }]}>
              <Text style={[styles.pillText, { color: '#FFFFFF' }]}>{t('feed.createLink')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  pill: { height: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontFamily: fonts.medium, fontSize: 15 },
  types: { flexDirection: 'row', gap: 8 },
  type: { flex: 1, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 4 },
  typeText: { fontFamily: fonts.semibold, fontSize: 13 },
  card: { borderRadius: 32, padding: 16, gap: 12 },
  input: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 24, minHeight: 80, padding: 0, textAlignVertical: 'top' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  person: { height: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8 },
  personText: { fontFamily: fonts.semibold, fontSize: 14 },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  search: { height: 46, borderRadius: 999, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { width: 52, height: 32, borderRadius: 999, padding: 3, justifyContent: 'center' },
  thumb: { width: 26, height: 26, borderRadius: 13 },
  pick: { borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  pickTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  pickSub: { fontFamily: fonts.regular, fontSize: 13 },
});
