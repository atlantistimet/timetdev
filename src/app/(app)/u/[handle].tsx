import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ProfileTap } from '@/components/ProfileTap';
import { Body, Button, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { PostCard } from '@/components/PostCard';
import { ServiceCard } from '@/components/ServiceCard';
import { listCovers } from '@/lib/service-media';
import { type MediaItem } from '@/lib/media';
import { ReviewReply } from '@/components/ReviewReply';
import { useAuth } from '@/lib/auth';
import { followInfo, loadPosts, setFollow, type Post } from '@/lib/feed';
import { cleanTitle, formatEuro, listSellerServices, type SlotService } from '@/lib/booking';
import { finalPriceCents, listSellerOffers, validityText, type Offer } from '@/lib/offers';
import { loadReviews, type Review, type ReviewSummary } from '@/lib/reviews';
import { shareText } from '@/lib/slot-links';
import { loadProfileByHandle, loadProfileLink, type PublicProfile } from '@/lib/public-profile';
import { loadCategories, loadSellerStats, loadSellers, type Category, type Seller, type SellerStats } from '@/lib/explore';
import { fonts, radius, useTheme } from '@/theme';

const GREEN = '#34C759';

type Follow = { following: boolean; followers: number; followingCount: number };
type Loaded = { link: string | null; profile: PublicProfile; seller: Seller | null; stats: SellerStats | null; categories: Category[]; services: SlotService[]; covers: Record<string, MediaItem>; offers: Offer[]; posts: Post[]; reviews: Review[]; summary: ReviewSummary; follow: Follow; nowMs: number } | 'missing';

export default function PublicProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'services' | 'offers' | 'posts' | 'reviews'>('services');
  const scrollRef = useRef<ScrollView>(null);
  const tabsY = useRef(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const profile = handle ? await loadProfileByHandle(handle) : null;
      let result: Loaded = 'missing';
      if (profile) {
        const me = session?.user.id ?? '';
        const [services, offers, postsResult, follow, rev] = await Promise.all([
          listSellerServices(profile.id),
          listSellerOffers(profile.id),
          loadPosts(me, { kind: 'author', authorId: profile.id }),
          followInfo(me, profile.id),
          loadReviews(profile.id),
        ]);
        const covers = await listCovers([...services.map((x) => x.id), ...offers.map((x) => x.service_id)]);
        const [stats, sellers, categories, link] = await Promise.all([loadSellerStats([profile.id]), loadSellers([profile.id]), loadCategories(i18n.language), loadProfileLink(profile.id)]);
        result = { link, profile, seller: sellers[profile.id] ?? null, stats: stats[profile.id] ?? null, categories, services, covers, offers, posts: postsResult.posts, reviews: rev.reviews, summary: rev.summary, follow, nowMs: Date.now() };
      }
      if (alive) setLoaded(result);
    })();
    return () => {
      alive = false;
    };
  }, [handle, session?.user.id, reloadKey, i18n.language]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('publicProfile.notFound')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }

  const { link, profile, seller, stats, categories, services, covers, offers, posts, reviews, summary, follow, nowMs } = loaded;
  const isFollowing = following ?? follow.following;
  const mine = session?.user.id === profile.id;
  const profileEmoji = categories.find((c) => c.key === seller?.categories[0])?.emoji ?? null;
  const where = [...new Set(services.flatMap((s) => s.places))];
  const callableNow = !!profile.available_until && new Date(profile.available_until).getTime() > nowMs;
  const rateService = services.find((s) => s.kind === 'per_minute');
  const bookable = services.filter((s) => s.kind !== 'per_minute');
  const avg = stats?.rating_avg ?? (summary.count > 0 ? summary.average : null);
  const hours = stats?.hours_shared ?? 0;
  const rateText = rateService ? t('explore.perMin', { price: formatEuro(rateService.rate_cents_per_min ?? 0, i18n.language) }) : null;
  const priceText = (s: SlotService) =>
    s.kind === 'per_minute' ? t('explore.perMin', { price: formatEuro(s.rate_cents_per_min ?? 0, i18n.language) }) : s.pricing === 'timed' ? t('explore.perHour', { price: formatEuro(s.price_cents, i18n.language) }) : formatEuro(s.price_cents, i18n.language);
  const metaText = (s: SlotService) =>
    [s.kind === 'package' ? t('book.packageShort', { count: s.sessions ?? 0 }) : s.kind === 'per_minute' ? null : s.pricing === 'timed' ? t('explore.timedRange', { min: s.duration_min, max: s.max_duration_min ?? s.duration_min }) : t('explore.minutes', { n: s.duration_min }), s.places.map((p) => t(`places.${p}`)).join(', ')]
      .filter(Boolean)
      .join(' · ');
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'posts', label: t('publicProfile.posts') },
    { key: 'services', label: t('publicProfile.services') },
    { key: 'offers', label: t('publicProfile.offers') },
    { key: 'reviews', label: t('publicProfile.tabReviews') },
  ];
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/services'));
  const onBook = () => {
    if (bookable.length === 1) router.push({ pathname: '/service/[id]', params: { id: bookable[0].id } });
    else setTab('services');
  };
  const topOffer = offers[0];

  const goReviews = () => {
    setTab('reviews');
    scrollRef.current?.scrollTo({ y: Math.max(tabsY.current - 8, 0), animated: true });
  };
  const openLink = (raw: string) => {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  };
  const dist = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => Math.round(r.rating) === n).length);
  const shareProfile = () => void shareText(`https://timeet.world/u/${profile.handle ?? handle}`);
  const toggleFollow = async () => {
    const next = !isFollowing;
    setFollowing(next);
    if (await setFollow(session?.user.id ?? '', profile.id, next)) setFollowing(!next);
  };
  const goChat = () => router.push({ pathname: '/chat/[userId]', params: { userId: profile.id } });
  const hoursText = `${hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace('.0', '').replace('.', ',')} h`;

  return (
    <Screen bare scrollRef={scrollRef}>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('publicProfile.back')} onPress={goBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <Text numberOfLines={1} style={[styles.handleTitle, { color: theme.text }]}>{profile.handle ? `@${profile.handle}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('profile.share')} onPress={shareProfile} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.head}>
          <View style={[styles.ring, callableNow && { borderColor: GREEN }]}>
            <Avatar name={profile.full_name} seed={profile.id} size={callableNow ? 96 : 108} round={callableNow ? 48 : 54} path={seller?.avatar_path} />
          </View>
          <View style={styles.headRight}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.name, { color: theme.text }]}>{profile.full_name}</Text>
            {profile.role_title || profile.city ? <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{[profile.role_title, profile.city].filter(Boolean).join(' · ')}</Text> : null}
            <View style={styles.counters}>
              <View style={styles.counter}>
                <Text numberOfLines={1} style={[styles.numBig, { color: theme.text }]}>{String(stats?.sessions_count ?? 0)}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.numSmall, { color: theme.muted }]}>{t('publicProfile.statSessions')}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={goReviews} style={styles.counter}>
                <Text numberOfLines={1} style={[styles.numBig, { color: theme.text }]}>{avg ? `${Number(avg).toFixed(1).replace('.', ',')} ★` : '–'}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.numSmall, styles.underlined, { color: theme.muted }]}>{t('publicProfile.statReviews')}</Text>
              </Pressable>
              <View style={styles.counter}>
                <Text numberOfLines={1} style={[styles.numBig, { color: theme.text }]}>{hoursText}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.numSmall, { color: theme.muted }]}>{t('publicProfile.statHours')}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.who}>
          {profile.bio ? <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text> : null}
          {link ? (
            <Pressable accessibilityRole="link" onPress={() => openLink(link)} style={styles.linkRow}>
              <Ionicons name="link-outline" size={16} color={theme.text} />
              <Text numberOfLines={1} style={[styles.linkText, { color: theme.text }]}>{link.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</Text>
            </Pressable>
          ) : null}
          {where.length > 0 ? (
            <Text style={[styles.placesLine, { color: theme.muted }]}>{where.map((p) => (p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`))).join(' · ')}</Text>
          ) : null}
          <Text style={[styles.placesLine, { color: theme.muted }]}>
            <Text style={{ color: theme.text, fontFamily: fonts.semibold }}>{follow.followers + (following === null || following === follow.following ? 0 : following ? 1 : -1)}</Text>
            {` ${t('publicProfile.followers')} · `}
            <Text style={{ color: theme.text, fontFamily: fonts.semibold }}>{follow.followingCount}</Text>
            {` ${t('publicProfile.followingLabel')}`}
          </Text>
        </View>

        <View style={styles.actions}>
          {mine ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={[styles.action, { backgroundColor: theme.accent, flex: 1 }]}>
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('publicProfile.editMine')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('profile.share')} onPress={shareProfile} style={[styles.action, { backgroundColor: theme.surface, width: 48 }]}>
                <Ionicons name="share-outline" size={21} color={theme.text} />
              </Pressable>
            </>
          ) : (
            <>
              {bookable.length > 0 ? (
                <Pressable accessibilityRole="button" onPress={onBook} style={[styles.action, { backgroundColor: theme.accent, flex: 1.5 }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('publicProfile.book')}</Text>
                </Pressable>
              ) : rateService ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={!callableNow}
                  onPress={() => router.push({ pathname: '/call-start', params: { serviceId: rateService.id } })}
                  style={[styles.action, { backgroundColor: theme.accent, flex: 1.5, opacity: callableNow ? 1 : 0.5 }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{callableNow ? t('publicProfile.callWithRate', { rate: rateText }) : t('publicProfile.callUnavailable')}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={goChat} style={[styles.action, { backgroundColor: theme.ink, flex: 1 }]}>
                <Text style={[styles.actionText, { color: theme.inkOn }]}>{t('publicProfile.write')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(isFollowing ? 'publicProfile.unfollow' : 'publicProfile.follow')}
                onPress={() => void toggleFollow()}
                style={[styles.action, { backgroundColor: isFollowing ? theme.accent : theme.surface, width: 48 }]}>
                <Ionicons name={isFollowing ? 'checkmark' : 'person-add-outline'} size={21} color={isFollowing ? theme.onAccent : theme.text} />
              </Pressable>
            </>
          )}
        </View>

        <View accessibilityRole="tablist" onLayout={(e) => { tabsY.current = e.nativeEvent.layout.y; }} style={[styles.tabs, { borderBottomColor: theme.fill }]}>
          {tabs.map((x) => (
            <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: tab === x.key }} onPress={() => setTab(x.key)} style={[styles.tab, tab === x.key && { borderBottomColor: theme.accent }]}>
              <Text style={[styles.tabText, { color: tab === x.key ? theme.text : theme.muted, fontFamily: tab === x.key ? fonts.semibold : fonts.medium }]}>{x.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'posts' ? (
          <>
            {posts.length === 0 ? <Body muted>{t('publicProfile.noPosts')}</Body> : null}
            {posts.map((post) => (
              <PostCard key={post.id} post={post} userId={session?.user.id ?? ''} nowMs={nowMs} onDeleted={() => setReloadKey((k) => k + 1)} />
            ))}
          </>
        ) : tab === 'services' ? (
          <>
            {topOffer ? (
              <Pressable accessibilityRole="button" onPress={() => setTab('offers')} style={[styles.offerBanner, { backgroundColor: theme.accent }]}>
                <Text numberOfLines={1} style={[styles.offerTitle, { color: theme.onAccent }]}>{t('publicProfile.offerBanner', { title: topOffer.service_title, price: formatEuro(finalPriceCents(topOffer), i18n.language) })}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.onAccent} />
              </Pressable>
            ) : null}
            {services.length === 0 ? <Body muted>{t('publicProfile.noServices')}</Body> : null}
            <View style={styles.grid}>
              {services.map((s) => (
                <ServiceCard key={s.id} id={s.id} title={cleanTitle(s.title)} price={priceText(s)} meta={metaText(s)} cover={covers[s.id]} emoji={profileEmoji} liveLabel={t('explore.nowShort')} onPress={() => router.push({ pathname: '/service/[id]', params: { id: s.id } })} />
              ))}
            </View>
          </>
        ) : tab === 'reviews' ? (
          <>
            {reviews.length === 0 ? <Body muted>{t('reviews.none')}</Body> : null}
            {reviews.length > 0 ? (
              <View style={[styles.sumCard, { backgroundColor: theme.surface }]}>
                <View style={styles.sumLeft}>
                  <Text style={[styles.sumBig, { color: theme.text }]}>{Number(summary.average).toFixed(1).replace('.', ',')}</Text>
                  <Text style={[styles.sumStars, { color: theme.text }]}>{'★'.repeat(Math.round(summary.average))}</Text>
                  <Text style={[styles.numSmall, { color: theme.muted }]}>{t('publicProfile.reviewsCount', { count: summary.count })}</Text>
                </View>
                <View style={styles.sumBars}>
                  {dist.map((n, i) => (
                    <View key={i} style={styles.barRow}>
                      <Text style={[styles.barLabel, { color: theme.muted }]}>{5 - i}</Text>
                      <View style={[styles.barTrack, { backgroundColor: theme.fill }]}>
                        <View style={[styles.barFill, { backgroundColor: theme.ink, width: `${summary.count ? (n / summary.count) * 100 : 0}%` }]} />
                      </View>
                      <Text style={[styles.barCount, { color: theme.muted }]}>{n}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {reviews.map((r) => (
              <View key={r.id} style={[styles.review, { backgroundColor: theme.surface }]}>
                <View style={styles.reviewHead}>
                  {r.author_handle ? <ProfileTap userId="" handle={r.author_handle}><Avatar name={r.author_name || '?'} seed={r.author_name} size={36} round={18} /></ProfileTap> : <Avatar name={r.author_name || '?'} seed={r.author_name} size={36} round={18} />}
                  <View style={styles.rowBody}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text, fontSize: 15 }]}>{r.author_name}</Text>
                    <Text style={[styles.rowMeta, { color: theme.muted }]}>{new Date(r.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}</Text>
                  </View>
                  <Text style={[styles.reviewStars, { color: theme.text }]}>{'★'.repeat(Math.round(r.rating))}</Text>
                </View>
                {r.body ? <Text style={[styles.reviewBody, { color: theme.text }]}>{r.body}</Text> : null}
                <ReviewReply reviewId={r.id} reply={r.reply} sellerName={profile.full_name} canReply={mine} onDone={() => setReloadKey((k) => k + 1)} />
              </View>
            ))}
          </>
        ) : (
          <>
            {offers.length === 0 ? <Body muted>{t('publicProfile.noOffers')}</Body> : null}
            <View style={styles.grid}>
              {offers.map((o) => (
                <ServiceCard key={o.id} id={o.service_id} title={cleanTitle(o.service_title)} price={formatEuro(finalPriceCents(o), i18n.language)} meta={validityText(o.validity, i18n.language, t)} cover={covers[o.service_id]} emoji={profileEmoji} badge={o.discount_pct ? `−${o.discount_pct}%` : null} liveLabel={t('explore.nowShort')} onPress={() => router.push({ pathname: '/book', params: { serviceId: o.service_id, offerId: o.id } })} />
              ))}
            </View>
          </>
        )}
        <View style={{ height: 120 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  handleTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 2 },
  ring: { width: 112, height: 112, borderRadius: 56, borderWidth: 4, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  headRight: { flex: 1, minWidth: 0, gap: 2 },
  counters: { flexDirection: 'row', marginTop: 8, gap: 6 },
  counter: { flex: 1, minWidth: 0 },
  numBig: { fontFamily: fonts.semibold, fontSize: 16, letterSpacing: -0.4 },
  numSmall: { fontFamily: fonts.medium, fontSize: 11 },
  underlined: { textDecorationLine: 'underline' },
  who: { paddingHorizontal: 4, gap: 4, marginTop: 4 },
  name: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.7 },
  sub: { fontFamily: fonts.medium, fontSize: 13 },
  bio: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkText: { fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline', flexShrink: 1 },
  placesLine: { fontFamily: fonts.medium, fontSize: 13 },
  faces: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  facesRow: { flexDirection: 'row' },
  face: { borderWidth: 2, borderRadius: 20 },
  facesText: { flex: 1, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  action: { height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { fontFamily: fonts.semibold, fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 22, marginTop: 6, marginHorizontal: 4, borderBottomWidth: 1 },
  tab: { paddingBottom: 9, marginBottom: -1, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  sumCard: { flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 22, padding: 14 },
  sumLeft: { alignItems: 'center' },
  sumBig: { fontFamily: fonts.semibold, fontSize: 38, letterSpacing: -1.6, lineHeight: 42 },
  sumStars: { fontSize: 15, letterSpacing: 1 },
  sumBars: { flex: 1, gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { width: 10, fontFamily: fonts.medium, fontSize: 11 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barCount: { width: 14, textAlign: 'right', fontFamily: fonts.medium, fontSize: 11 },
  review: { borderRadius: 22, padding: 14, gap: 8 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewStars: { fontSize: 14 },
  reviewBody: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  offerBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  offerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  card: { borderRadius: 22, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth },
  rowTile: { width: 44, height: 44, borderRadius: 14 },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowMeta: { fontFamily: fonts.medium, fontSize: 13 },
  rowPrice: { fontFamily: fonts.semibold, fontSize: 16 },
});
