import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { Body, Button, Card, LoadingView, Pill, Screen, Spacer, Title } from '@/components/ui';
import { PostCard } from '@/components/PostCard';
import { ReviewReply } from '@/components/ReviewReply';
import { useAuth } from '@/lib/auth';
import { followInfo, loadPosts, setFollow, type Post } from '@/lib/feed';
import { cleanTitle, formatEuro, listSellerServices, type SlotService } from '@/lib/booking';
import { finalPriceCents, listSellerOffers, validityText, type Offer } from '@/lib/offers';
import { loadReviews, stars, type Review, type ReviewSummary } from '@/lib/reviews';
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

  const { profile, seller, stats, categories, services, offers, posts, reviews, summary, follow, nowMs } = loaded;
  const isFollowing = following ?? follow.following;
  const mine = session?.user.id === profile.id;
  const where = [...new Set(services.flatMap((s) => s.places))];
  const callableNow = !!profile.available_until && new Date(profile.available_until).getTime() > nowMs;
  const firstName = profile.full_name.split(/\s+/)[0] ?? profile.full_name;
  const lastName = profile.full_name.split(/\s+/).slice(1).join(' ');
  const emoji = categories.find((c) => c.key === seller?.categories[0])?.emoji ?? null;
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

  const footer = !mine ? (
    <View style={[styles.bar, { backgroundColor: theme.ink }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('chat.write_to')} onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: profile.id } })} style={[styles.barChat, { backgroundColor: theme.inkSurface2 }]}>
        <Ionicons name="chatbubble-outline" size={22} color={theme.inkOn} />
      </Pressable>
      {rateService ? (
        <Pressable
          accessibilityRole="button"
          disabled={!callableNow}
          onPress={() => router.push({ pathname: '/call-start', params: { serviceId: rateService.id } })}
          style={[styles.barCall, { backgroundColor: theme.surface, opacity: callableNow ? 1 : 0.55 }]}>
          <Text style={[styles.barText, { color: theme.text }]}>{callableNow ? t('publicProfile.callWithRate', { rate: rateText }) : t('publicProfile.callUnavailable')}</Text>
        </Pressable>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {bookable.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={onBook} style={[styles.barBook, { backgroundColor: theme.accent }]}>
          <Text style={[styles.barText, { color: theme.onAccent }]}>{t('publicProfile.book')}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : undefined;

  const row = (key: string, tileColor: string, title: string, meta: string, price: string, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={[styles.row, { backgroundColor: theme.surface }]}>
      <View style={[styles.rowTile, { backgroundColor: tileColor }]}>
        <Emoji name={emoji} size={32} />
      </View>
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.muted }]}>{meta}</Text> : null}
      </View>
      <Text style={[styles.rowPrice, { color: theme.text }]}>{price}</Text>
    </Pressable>
  );

  return (
    <Screen bare footer={footer}>
      <View style={[styles.hero, { backgroundColor: tint }]}>
        <View style={styles.heroTop}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('publicProfile.back')} onPress={goBack} style={styles.heroBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
          {mine ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={[styles.heroFollow, { backgroundColor: theme.ink }]}>
              <Text style={[styles.heroFollowText, { color: theme.inkOn }]}>{t('publicProfile.editMine')}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const next = !isFollowing;
                setFollowing(next);
                if (await setFollow(session?.user.id ?? '', profile.id, next)) setFollowing(!next);
              }}
              style={[styles.heroFollow, { backgroundColor: theme.ink }]}>
              <Text style={[styles.heroFollowText, { color: theme.inkOn }]}>{t(isFollowing ? 'publicProfile.unfollow' : 'publicProfile.follow')}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.heroMain}>
          <View style={styles.heroText}>
            {callableNow ? (
              <View style={[styles.live, { backgroundColor: theme.accent }]}>
                <View style={[styles.liveDot, { backgroundColor: theme.onAccent }]} />
                <Text style={[styles.liveText, { color: theme.onAccent }]}>{t('explore.availableNow')}</Text>
              </View>
            ) : null}
            <Text style={[styles.name, { color: theme.ink }]}>
              {firstName}
              {lastName ? `\n${lastName}` : ''}
            </Text>
            <View style={styles.roleRow}>
              <Text style={[styles.role, { color: theme.ink }]}>{[profile.role_title, profile.city].filter(Boolean).join(' · ')}</Text>
              {profile.role_title ? <Emoji name={emoji} size={18} /> : null}
            </View>
          </View>
          <View style={styles.heroAvatar}>
            <Avatar name={profile.full_name} seed={profile.id} size={104} round={36} path={seller?.avatar_path} />
            {emoji ? (
              <View style={styles.heroBadge}>
                <Emoji name={emoji} size={24} />
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: theme.accent }]}>
            <Text style={[styles.statNum, { color: theme.onAccent }]}>{`${hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace('.0', '')} h`}</Text>
            <Text style={[styles.statLabel, { color: theme.onAccent }]}>{t('publicProfile.statHours')}</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statNum, { color: theme.text }]}>{stats?.sessions_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>{t('publicProfile.statSessions')}</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: theme.surface }]}>
            <Text style={[styles.statNum, { color: theme.text }]}>{avg ? Number(avg).toFixed(1).replace('.', ',') : '–'}</Text>
            <Text style={[styles.statLabel, { color: theme.muted }]}>{t('reviews.count', { count: reviewsCount })}</Text>
          </View>
        </View>

        {stats && stats.reviewers_count > 0 ? (
          <View style={[styles.faces, { backgroundColor: theme.surface }]}>
            <View style={styles.facesRow}>
              {stats.reviewers.slice(0, 3).map((r, i) => (
                <View key={r.id} style={[styles.face, { borderColor: theme.surface, marginLeft: i === 0 ? 0 : -9 }]}>
                  <Avatar name={r.full_name} seed={r.id} size={32} path={r.avatar_path} />
                </View>
              ))}
            </View>
            <Text style={[styles.facesText, { color: theme.muted }]}>
              <Text style={{ color: theme.text, fontFamily: fonts.semibold }}>{t('publicProfile.reviewedBy', { count: stats.reviewers_count })}</Text>
            </Text>
            <Emoji name="heart_hands" size={24} />
          </View>
        ) : null}

        {profile.bio ? <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text> : null}
        {where.length > 0 ? (
          <View style={styles.places}>
            {where.map((p) => (
              <Pill key={p} label={p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`)} />
            ))}
          </View>
        ) : null}

        <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.surface }]}>
          {tabs.map((x) => (
            <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: tab === x.key }} onPress={() => setTab(x.key)} style={[styles.tab, tab === x.key && { backgroundColor: theme.ink }]}>
              <Text style={[styles.tabText, { color: tab === x.key ? theme.inkOn : theme.text, fontFamily: tab === x.key ? fonts.semibold : fonts.medium }]}>{x.label}</Text>
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
                <Emoji name="party_popper" size={34} />
                <View style={styles.rowBody}>
                  <Text style={[styles.offerTitle, { color: theme.onAccent }]}>{t('publicProfile.offerBanner', { title: topOffer.service_title, price: formatEuro(finalPriceCents(topOffer), i18n.language) })}</Text>
                  <Text style={[styles.offerSub, { color: theme.onAccent }]}>{validityText(topOffer.validity, i18n.language, t)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.onAccent} />
              </Pressable>
            ) : null}
            {services.length === 0 ? <Body muted>{t('publicProfile.noServices')}</Body> : null}
            {services.map((s) =>
              row(s.id, pastelFor(s.id), cleanTitle(s.title), metaText(s), priceText(s), () => router.push({ pathname: '/service/[id]', params: { id: s.id } })),
            )}
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
                pastelFor(o.id),
                cleanTitle(o.service_title),
                `${o.discount_pct ? `−${o.discount_pct}% · ` : ''}${validityText(o.validity, i18n.language, t)}`,
                formatEuro(finalPriceCents(o), i18n.language),
                () => router.push({ pathname: '/book', params: { serviceId: o.service_id, offerId: o.id } }),
              ),
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { margin: 8, borderRadius: 38, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20, gap: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  heroFollow: { height: 44, paddingHorizontal: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  heroFollowText: { fontFamily: fonts.medium, fontSize: 15 },
  heroMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  heroText: { flex: 1, gap: 8 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 30, paddingHorizontal: 12, borderRadius: radius.pill },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontFamily: fonts.semibold, fontSize: 13 },
  name: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 42, letterSpacing: -2 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  role: { fontFamily: fonts.medium, fontSize: 15, flexShrink: 1 },
  heroAvatar: { width: 104, height: 104 },
  heroBadge: { position: 'absolute', right: -6, bottom: -6, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  statNum: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: -1.1 },
  statLabel: { fontFamily: fonts.medium, fontSize: 12 },
  faces: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 14 },
  facesRow: { flexDirection: 'row' },
  face: { borderWidth: 2, borderRadius: 20 },
  facesText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  bio: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  places: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, marginTop: 4 },
  tab: { flex: 1, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  offerBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  offerTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  offerSub: { fontFamily: fonts.medium, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.card, padding: 10 },
  rowTile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowMeta: { fontFamily: fonts.medium, fontSize: 13 },
  rowPrice: { fontFamily: fonts.semibold, fontSize: 18, paddingRight: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: radius.pill },
  barChat: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  barCall: { flex: 1, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  barBook: { flex: 1, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  barText: { fontFamily: fonts.semibold, fontSize: 15 },
});
