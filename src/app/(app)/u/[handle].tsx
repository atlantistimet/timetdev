import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Chip, ChipRow, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { MediaGallery } from '@/components/MediaView';
import { PostCard } from '@/components/PostCard';
import { useAuth } from '@/lib/auth';
import { followInfo, loadPosts, setFollow, type Post } from '@/lib/feed';
import { formatEuro, listSellerServices, type SlotService } from '@/lib/booking';
import { finalPriceCents, listSellerOffers, validityText, type Offer } from '@/lib/offers';
import { loadReviews, stars, type Review, type ReviewSummary } from '@/lib/reviews';
import { initials, loadProfileByHandle, type PublicProfile } from '@/lib/public-profile';
import { type MediaItem } from '@/lib/media';
import { listCovers } from '@/lib/service-media';
import { useTheme } from '@/theme';

type Follow = { following: boolean; followers: number; followingCount: number };
type Loaded = { profile: PublicProfile; services: SlotService[]; offers: Offer[]; covers: Record<string, MediaItem>; posts: Post[]; reviews: Review[]; summary: ReviewSummary; follow: Follow; nowMs: number } | 'missing';

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
        const covers = await listCovers(services.map((s) => s.id));
        result = { profile, services, offers, covers, posts: postsResult.posts, reviews: rev.reviews, summary: rev.summary, follow, nowMs: Date.now() };
      }
      if (alive) setLoaded(result);
    })();
    return () => {
      alive = false;
    };
  }, [handle, session?.user.id, reloadKey]);

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

  const { profile, services, offers, covers, posts, reviews, summary, follow, nowMs } = loaded;
  const isFollowing = following ?? follow.following;
  const followerCount = follow.followers + (following === null ? 0 : (following ? 1 : 0) - (follow.following ? 1 : 0));
  const mine = session?.user.id === profile.id;
  const where = [...new Set(services.flatMap((s) => s.places))];
  const callableNow = !!profile.available_until && new Date(profile.available_until).getTime() > nowMs;

  return (
    <Screen>
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.onPrimary }]}>{initials(profile.full_name)}</Text>
        </View>
        <Title>{profile.full_name}</Title>
        {profile.handle ? <Body muted>@{profile.handle}</Body> : null}
        {profile.role_title ? <Body>{profile.role_title}</Body> : null}
        {profile.city ? <Body muted>{profile.city}</Body> : null}
        {summary.count > 0 ? <Body>{`${stars(summary.average)} ${summary.average.toFixed(1)} · ${t('reviews.count', { count: summary.count })}`}</Body> : null}
        {profile.bio ? <Body muted>{profile.bio}</Body> : null}
      </View>
      {where.length > 0 ? (
        <ChipRow>
          {where.map((p) => (
            <Chip key={p} label={p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`)} selected={false} onPress={() => {}} />
          ))}
        </ChipRow>
      ) : null}
      <Body muted>
        {t('publicProfile.followers', { count: followerCount })} · {t('publicProfile.followingCount', { count: follow.followingCount })}
      </Body>
      <Spacer size={8} />
      {!mine ? (
        <Button
          title={t(isFollowing ? 'publicProfile.unfollow' : 'publicProfile.follow')}
          variant={isFollowing ? 'ghost' : 'primary'}
          onPress={async () => {
            const next = !isFollowing;
            setFollowing(next);
            if (await setFollow(session?.user.id ?? '', profile.id, next)) setFollowing(!next);
          }}
        />
      ) : null}
      {!mine ? (
        <>
          <Spacer size={8} />
          <Button title={t('chat.write_to')} variant="ghost" onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: profile.id } })} />
        </>
      ) : null}
      {mine ? <Button title={t('publicProfile.editMine')} variant="ghost" onPress={() => router.push('/profile-edit')} /> : null}
      <Spacer size={8} />
      <ChipRow>
        <Chip label={`${t('publicProfile.posts')} (${posts.length})`} selected={tab === 'posts'} onPress={() => setTab('posts')} />
        <Chip label={`${t('publicProfile.services')} (${services.length})`} selected={tab === 'services'} onPress={() => setTab('services')} />
        <Chip label={`${t('publicProfile.offers')} (${offers.length})`} selected={tab === 'offers'} onPress={() => setTab('offers')} />
        <Chip label={`${t('reviews.title')} (${summary.count})`} selected={tab === 'reviews'} onPress={() => setTab('reviews')} />
      </ChipRow>

      {tab === 'posts' ? (
        <>
          {posts.length === 0 ? <Body muted>{t('publicProfile.noPosts')}</Body> : null}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} userId={session?.user.id ?? ''} nowMs={nowMs} onDeleted={() => setReloadKey((k) => k + 1)} />
          ))}
        </>
      ) : tab === 'services' ? (
        <>
          {services.length === 0 ? <Body muted>{t('publicProfile.noServices')}</Body> : null}
          {services.map((service) => (
            <Card key={service.id}>
              <MediaGallery items={covers[service.id] ? [covers[service.id]] : []} bucket="service-media" size="small" />
              <Body>{service.title}</Body>
              <Body muted>
                {service.kind === 'per_minute'
                  ? t('calls.rateLine', { price: formatEuro(service.rate_cents_per_min ?? 0, i18n.language) })
                  : service.kind === 'package'
                    ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: formatEuro(service.price_cents, i18n.language) })
                    : `${formatEuro(service.price_cents, i18n.language)} · ${service.duration_min} min`}
                {' · '}
                {service.places.map((p) => t(`places.${p}`)).join(', ')}
              </Body>
              <Spacer size={8} />
              <Button title={t('publicProfile.details')} variant="ghost" onPress={() => router.push({ pathname: '/service/[id]', params: { id: service.id } })} />
              {!mine ? (
                <>
                  <Spacer size={8} />
                  {service.kind === 'per_minute' ? (
                    <Button
                      title={t(callableNow ? 'calls.callNow' : 'calls.notAvailable')}
                      onPress={() => (callableNow ? router.push({ pathname: '/call-start', params: { serviceId: service.id } }) : undefined)}
                    />
                  ) : (
                    <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />
                  )}
                </>
              ) : null}
            </Card>
          ))}
        </>
      ) : tab === 'reviews' ? (
        <>
          {reviews.length === 0 ? <Body muted>{t('reviews.none')}</Body> : null}
          {reviews.map((r) => (
            <Card key={r.id}>
              <Body>{`${stars(r.rating)} · ${r.author_name}`}</Body>
              {r.body ? <Body muted>{r.body}</Body> : null}
              <Body muted>{new Date(r.created_at).toLocaleDateString(i18n.language)}</Body>
            </Card>
          ))}
        </>
      ) : (
        <>
          {offers.length === 0 ? <Body muted>{t('publicProfile.noOffers')}</Body> : null}
          {offers.map((offer) => (
            <Card key={offer.id}>
              <Body>
                {offer.service_title}
                {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
              </Body>
              <Body muted>
                {formatEuro(finalPriceCents(offer), i18n.language)} · {offer.duration_min} min
              </Body>
              <Body muted>{validityText(offer.validity, i18n.language, t)}</Body>
              {offer.message ? <Body muted>{offer.message}</Body> : null}
              {!mine ? (
                <>
                  <Spacer size={8} />
                  <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id } })} />
                </>
              ) : null}
            </Card>
          ))}
        </>
      )}
      <Spacer size={8} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 2, marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 26, fontWeight: '800' },
});
