import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

  const shareProfile = () => void shareText(`https://timeet.world/u/${profile.handle ?? handle}`);
  const toggleFollow = async () => {
    const next = !isFollowing;
    setFollowing(next);
    if (await setFollow(session?.user.id ?? '', profile.id, next)) setFollowing(!next);
  };
  const goChat = () => router.push({ pathname: '/chat/[userId]', params: { userId: profile.id } });
  const hoursText = `${hours >= 10 ? Math.round(hours) : hours.toFixed(1).replace('.0', '').replace('.', ',')} h`;

  const row = (key: string, color: string, title: string, meta: string, price: string, onPress: () => void) => (
    <Pressable key={key} accessibilityRole="button" onPress={onPress} style={[styles.row, { borderTopColor: theme.fill }]}>
      <View style={[styles.rowTile, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
        {meta ? <Text numberOfLines={1} style={[styles.rowMeta, { color: theme.muted }]}>{meta}</Text> : null}
      </View>
      <Text style={[styles.rowPrice, { color: theme.text }]}>{price}</Text>
    </Pressable>
  );
  const list = (rows: React.ReactNode[]) => (rows.length > 0 ? <View style={[styles.card, { backgroundColor: theme.surface }]}>{rows}</View> : null);

  return (
    <Screen bare>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('publicProfile.back')} onPress={goBack} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('profile.share')} onPress={shareProfile} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.head}>
          <Avatar name={profile.full_name} seed={profile.id} size={76} round={38} path={seller?.avatar_path} />
          <View style={styles.numbers}>
            <View style={styles.number}>
              <Text style={[styles.numBig, { color: theme.text }]}>{String(stats?.sessions_count ?? 0)}</Text>
              <Text style={[styles.numSmall, { color: theme.muted }]}>{t('publicProfile.statSessions')}</Text>
            </View>
            <View style={styles.number}>
              <Text style={[styles.numBig, { color: theme.text }]}>{avg ? `${Number(avg).toFixed(1).replace('.', ',')} ★` : '–'}</Text>
              <Text style={[styles.numSmall, { color: theme.muted }]}>{t('reviews.count', { count: reviewsCount })}</Text>
            </View>
            <View style={styles.number}>
              <Text style={[styles.numBig, { color: theme.text }]}>{hoursText}</Text>
              <Text style={[styles.numSmall, { color: theme.muted }]}>{t('publicProfile.statHours')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.who}>
          <Text style={[styles.name, { color: theme.text }]}>{profile.full_name}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>{[profile.role_title, profile.city, callableNow ? t('explore.availableNow') : null].filter(Boolean).join(' · ')}</Text>
          {profile.bio ? <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text> : null}
          {where.length > 0 ? (
            <Text style={[styles.placesLine, { color: theme.muted }]}>{where.map((p) => (p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`))).join(' · ')}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {mine ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={[styles.action, { backgroundColor: theme.accent, flex: 1.4 }]}>
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('publicProfile.editMine')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={shareProfile} style={[styles.action, { backgroundColor: theme.surface, flex: 1 }]}>
                <Text style={[styles.actionText, { color: theme.text }]}>{t('profile.share')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {bookable.length > 0 ? (
                <Pressable accessibilityRole="button" onPress={onBook} style={[styles.action, { backgroundColor: theme.accent, flex: 1.4 }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('publicProfile.book')}</Text>
                </Pressable>
              ) : rateService ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={!callableNow}
                  onPress={() => router.push({ pathname: '/call-start', params: { serviceId: rateService.id } })}
                  style={[styles.action, { backgroundColor: theme.accent, flex: 1.4, opacity: callableNow ? 1 : 0.5 }]}>
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{callableNow ? t('publicProfile.callWithRate', { rate: rateText }) : t('publicProfile.callUnavailable')}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={goChat} style={[styles.action, { backgroundColor: theme.surface, flex: 1 }]}>
                <Text style={[styles.actionText, { color: theme.text }]}>{t('publicProfile.write')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={[styles.action, { backgroundColor: isFollowing ? theme.ink : theme.surface, flex: 1 }]}>
                <Text style={[styles.actionText, { color: isFollowing ? theme.inkOn : theme.text }]}>{t(isFollowing ? 'publicProfile.unfollow' : 'publicProfile.follow')}</Text>
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
            {list(services.map((s) => row(s.id, pastelFor(s.id), cleanTitle(s.title), metaText(s), priceText(s), () => router.push({ pathname: '/service/[id]', params: { id: s.id } }))))}
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
            {list(
              offers.map((o) =>
                row(
                  o.id,
                  pastelFor(o.id),
                  cleanTitle(o.service_title),
                  `${o.discount_pct ? `−${o.discount_pct}% · ` : ''}${validityText(o.validity, i18n.language, t)}`,
                  formatEuro(finalPriceCents(o), i18n.language),
                  () => router.push({ pathname: '/book', params: { serviceId: o.service_id, offerId: o.id } }),
                ),
              ),
            )}
          </>
        )}
        <View style={{ height: 120 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4 },
  numbers: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  number: { alignItems: 'center', flexShrink: 1 },
  numBig: { fontFamily: fonts.semibold, fontSize: 18, letterSpacing: -0.5 },
  numSmall: { fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  who: { paddingHorizontal: 4, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  sub: { fontFamily: fonts.medium, fontSize: 14 },
  bio: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, marginTop: 4 },
  placesLine: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { fontFamily: fonts.semibold, fontSize: 15 },
  tabs: { flexDirection: 'row', gap: 22, marginTop: 6, marginHorizontal: 4, borderBottomWidth: 1 },
  tab: { paddingBottom: 9, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
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
