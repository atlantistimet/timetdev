import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Body, Button, Card, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { PostCard } from '@/components/PostCard';
import { ReviewReply } from '@/components/ReviewReply';
import { useAuth } from '@/lib/auth';
import { followInfo, loadPosts, setFollow, type Post } from '@/lib/feed';
import { cleanTitle, formatEuro, listSellerServices, type SlotService } from '@/lib/booking';
import { finalPriceCents, listSellerOffers, validityText, type Offer } from '@/lib/offers';
import { loadReviews, stars, type Review, type ReviewSummary } from '@/lib/reviews';
import { shareText } from '@/lib/slot-links';
import { loadProfileByHandle, type PublicProfile } from '@/lib/public-profile';
import { loadCategories, loadSellerStats, loadSellers, type Category, type Seller, type SellerStats } from '@/lib/explore';
import { fonts, pastelFor, radius, useTheme } from '@/theme';

type Follow = { following: boolean; followers: number; followingCount: number };
type Loaded = { profile: PublicProfile; seller: Seller | null; stats: SellerStats | null; categories: Category[]; services: SlotService[]; offers: Offer[]; posts: Post[]; reviews: Review[]; summary: ReviewSummary; follow: Follow; nowMs: number } | 'missing';

export default function PublicProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'services' | 'offers' | 'posts' | 'reviews'>('services');
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const coverW = Math.min(winW, 440);
  const COVER = 300;
  const BAR = insets.top + 56;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.get(), [COVER - BAR - 60, COVER - BAR], [0, 1], Extrapolation.CLAMP) }));
  const coverStyle = useAnimatedStyle(() => {
    const y = scrollY.get();
    return { transform: [{ translateY: y > 0 ? y * 0.5 : 0 }, { scale: y < 0 ? 1 + -y / COVER : 1 }] };
  });

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
        const [stats, sellers, categories] = await Promise.all([loadSellerStats([profile.id]), loadSellers([profile.id]), loadCategories(i18n.language)]);
        result = { profile, seller: sellers[profile.id] ?? null, stats: stats[profile.id] ?? null, categories, services, offers, posts: postsResult.posts, reviews: rev.reviews, summary: rev.summary, follow, nowMs: Date.now() };
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

  const { profile, seller, stats, services, offers, posts, reviews, summary, follow, nowMs } = loaded;
  const isFollowing = following ?? follow.following;
  const mine = session?.user.id === profile.id;
  const where = [...new Set(services.flatMap((s) => s.places))];
  const callableNow = !!profile.available_until && new Date(profile.available_until).getTime() > nowMs;
  const tint = pastelFor(profile.id);
  const rateService = services.find((s) => s.kind === 'per_minute');
  const bookable = services.filter((s) => s.kind !== 'per_minute');
  const avg = stats?.rating_avg ?? (summary.count > 0 ? summary.average : null);
  const reviewsCount = stats?.reviews_count ?? summary.count;
  const hours = stats?.hours_shared ?? 0;
  const rateText = rateService ? t('explore.perMin', { price: formatEuro(rateService.rate_cents_per_min ?? 0, i18n.language) }) : null;
  const priceText = (s: SlotService) =>
    s.kind === 'per_minute' ? t('explore.perMin', { price: formatEuro(s.rate_cents_per_min ?? 0, i18n.language) }) : formatEuro(s.price_cents, i18n.language);
  const metaText = (s: SlotService) =>
    [s.kind === 'package' ? t('book.packageShort', { count: s.sessions ?? 0 }) : s.kind === 'per_minute' ? null : t('explore.minutes', { n: s.duration_min }), s.places.map((p) => t(`places.${p}`)).join(', ')]
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

  const fromPrice = bookable.length > 0 ? Math.min(...bookable.map((s) => s.price_cents)) : 0;
  const shareProfile = () => void shareText(`https://timeet.world/u/${profile.handle ?? handle}`);
  const toggleFollow = async () => {
    const next = !isFollowing;
    setFollowing(next);
    if (await setFollow(session?.user.id ?? '', profile.id, next)) setFollowing(!next);
  };
  const goChat = () => router.push({ pathname: '/chat/[userId]', params: { userId: profile.id } });
  const statsLine = [
    `${stats?.sessions_count ?? 0} ${t('publicProfile.statSessions')}`,
    avg ? `${Number(avg).toFixed(1).replace('.', ',')} ★ (${reviewsCount})` : null,
    `${hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace('.0', '').replace('.', ',')} h ${t('publicProfile.statHours')}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const footer = !mine && (bookable.length > 0 || rateService) ? (
    <View style={styles.bar}>
      {rateService ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('publicProfile.callWithRate', { rate: rateText })}
          disabled={!callableNow}
          onPress={() => router.push({ pathname: '/call-start', params: { serviceId: rateService.id } })}
          style={[styles.barCall, { backgroundColor: theme.surface, opacity: callableNow ? 1 : 0.5 }]}>
          <Ionicons name="call-outline" size={22} color={theme.text} />
        </Pressable>
      ) : null}
      {bookable.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={onBook} style={[styles.barBook, { backgroundColor: theme.ink }]}>
          <Text style={[styles.barText, { color: theme.inkOn }]}>{`${t('publicProfile.book')} · ${t('publicProfile.from', { price: formatEuro(fromPrice, i18n.language) })}`}</Text>
        </Pressable>
      ) : (
        <View style={[styles.barBook, { backgroundColor: theme.ink, opacity: callableNow ? 1 : 0.5 }]}>
          <Text style={[styles.barText, { color: theme.inkOn }]}>{callableNow ? t('publicProfile.callWithRate', { rate: rateText }) : t('publicProfile.callUnavailable')}</Text>
        </View>
      )}
    </View>
  ) : null;

  const row = (key: string, title: string, meta: string, price: string, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={[styles.row, { borderBottomColor: theme.fill }]}>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.muted }]}>{meta}</Text> : null}
      </View>
      <Text style={[styles.rowPrice, { color: theme.text }]}>{price}</Text>
    </Pressable>
  );

  const roundBtn = (icon: 'chevron-back' | 'share-outline', label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.roundBtn}>
      <Ionicons name={icon} size={22} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 220 }}>
        <View style={[styles.column, { width: coverW }]}>
          <View style={[styles.cover, { height: COVER, backgroundColor: tint }]}>
            <Animated.View style={[styles.coverImg, coverStyle]}>
              <Avatar name={profile.full_name} seed={profile.id} size={coverW} round={0} path={seller?.avatar_path} />
            </Animated.View>
            <View pointerEvents="none" style={styles.coverShade} />
            <View style={styles.coverText}>
              {callableNow ? (
                <View style={[styles.live, { backgroundColor: theme.accent }]}>
                  <View style={[styles.liveDot, { backgroundColor: theme.onAccent }]} />
                  <Text style={[styles.liveText, { color: theme.onAccent }]}>{t('explore.availableNow')}</Text>
                </View>
              ) : null}
              <Text numberOfLines={2} style={styles.name}>{profile.full_name}</Text>
              <Text numberOfLines={1} style={styles.role}>{[profile.role_title, profile.city].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>

          <View style={styles.body}>
            <Text style={[styles.statsLine, { color: theme.muted }]}>{statsLine}</Text>
            {profile.bio ? <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text> : null}
            {where.length > 0 ? (
              <Text style={[styles.placesLine, { color: theme.muted }]}>{where.map((p) => (p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`))).join(' · ')}</Text>
            ) : null}

            <View style={styles.actions}>
              {mine ? (
                <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={[styles.action, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.actionText, { color: theme.text }]}>{t('publicProfile.editMine')}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable accessibilityRole="button" onPress={goChat} style={[styles.action, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.actionText, { color: theme.text }]}>{t('publicProfile.write')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={[styles.action, { backgroundColor: isFollowing ? theme.surface : theme.ink }]}>
                    <Text style={[styles.actionText, { color: isFollowing ? theme.text : theme.inkOn }]}>{t(isFollowing ? 'publicProfile.unfollow' : 'publicProfile.follow')}</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View accessibilityRole="tablist" style={[styles.tabs, { borderBottomColor: theme.fill }]}>
              {tabs.map((x) => (
                <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: tab === x.key }} onPress={() => setTab(x.key)} style={[styles.tab, tab === x.key && { borderBottomColor: theme.ink }]}>
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
                {services.map((s) => row(s.id, cleanTitle(s.title), metaText(s), priceText(s), () => router.push({ pathname: '/service/[id]', params: { id: s.id } })))}
              </>
            ) : tab === 'reviews' ? (
              <>
                {reviews.length === 0 ? <Body muted>{t('reviews.none')}</Body> : null}
                {reviews.map((r) => (
                  <Card key={r.id}>
                    <Body>{`${stars(r.rating)} · ${r.author_name}`}</Body>
                    {r.body ? <Body muted>{r.body}</Body> : null}
                    <Body muted>{new Date(r.created_at).toLocaleDateString(i18n.language)}</Body>
                    <ReviewReply reviewId={r.id} reply={r.reply} sellerName={profile.full_name} canReply={mine} onDone={() => setReloadKey((k) => k + 1)} />
                  </Card>
                ))}
              </>
            ) : (
              <>
                {offers.length === 0 ? <Body muted>{t('publicProfile.noOffers')}</Body> : null}
                {offers.map((o) =>
                  row(
                    o.id,
                    cleanTitle(o.service_title),
                    `${o.discount_pct ? `−${o.discount_pct}% · ` : ''}${validityText(o.validity, i18n.language, t)}`,
                    formatEuro(finalPriceCents(o), i18n.language),
                    () => router.push({ pathname: '/book', params: { serviceId: o.service_id, offerId: o.id } }),
                  ),
                )}
              </>
            )}
          </View>
        </View>
      </Animated.ScrollView>

      <View pointerEvents="box-none" style={[styles.topWrap, { height: BAR }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.fill }, barStyle]}>
          <View style={[styles.barTitleWrap, { paddingTop: insets.top }]}>
            <Text numberOfLines={1} style={[styles.barTitle, { color: theme.text }]}>{profile.full_name}</Text>
          </View>
        </Animated.View>
        <View pointerEvents="box-none" style={[styles.topRow, { top: insets.top + 6 }]}>
          {roundBtn('chevron-back', t('publicProfile.back'), goBack)}
          {roundBtn('share-outline', t('profile.share'), shareProfile)}
        </View>
      </View>

      {footer ? (
        <View pointerEvents="box-none" style={styles.footerWrap}>
          <View style={styles.footerColumn}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { alignSelf: 'center' },
  cover: { overflow: 'hidden', justifyContent: 'flex-end' },
  coverImg: { ...StyleSheet.absoluteFill },
  coverShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, backgroundColor: 'rgba(0,0,0,0.38)' },
  coverText: { paddingHorizontal: 18, paddingBottom: 16, gap: 4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: radius.pill, marginBottom: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontFamily: fonts.semibold, fontSize: 13 },
  name: { fontFamily: fonts.semibold, fontSize: 32, letterSpacing: -1.2, color: '#FFFFFF' },
  role: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.88)' },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  statsLine: { fontFamily: fonts.medium, fontSize: 14 },
  bio: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  placesLine: { fontFamily: fonts.medium, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  action: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: fonts.semibold, fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 22, marginTop: 6, borderBottomWidth: 1 },
  tab: { paddingBottom: 9, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  offerBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  offerTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowMeta: { fontFamily: fonts.medium, fontSize: 13 },
  rowPrice: { fontFamily: fonts.semibold, fontSize: 17 },
  topWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  barTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 70 },
  barTitle: { fontFamily: fonts.semibold, fontSize: 17 },
  footerWrap: { position: 'absolute', left: 12, right: 12, bottom: 108, alignItems: 'center' },
  footerColumn: { width: '100%', maxWidth: 440 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barCall: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  barBook: { flex: 1, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  barText: { fontFamily: fonts.semibold, fontSize: 16 },
});
