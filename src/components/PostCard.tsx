import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MediaGallery } from '@/components/MediaView';
import { Body, Button, Card, Spacer } from '@/components/ui';
import { formatEuro } from '@/lib/booking';
import { deletePost, setLike, type Post } from '@/lib/feed';
import { initials } from '@/lib/public-profile';
import { dayLabel } from '@/lib/time';
import { discountedCents } from '@/lib/validity';
import { useTheme } from '@/theme';

function timeAgo(iso: string, language: string, nowMs: number): string {
  const diff = (new Date(iso).getTime() - nowMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86_400), 'day');
}

export function PostCard({ post, userId, nowMs, onDeleted }: { post: Post; userId: string; nowMs: number; onDeleted: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const mine = post.author_id === userId;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const failure = await setLike(post.id, userId, next);
    if (failure) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  };
  const openAuthor = () => post.author.handle && router.push({ pathname: '/u/[handle]', params: { handle: post.author.handle } });

  const expired = !!post.link?.expires_at && new Date(post.link.expires_at).getTime() < nowMs;

  return (
    <Card>
      <Pressable accessibilityRole="button" onPress={openAuthor} style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.onPrimary }]}>{initials(post.author.full_name)}</Text>
        </View>
        <View style={styles.who}>
          <Text style={[styles.name, { color: theme.text }]}>{post.author.full_name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            {[post.author.role_title, timeAgo(post.created_at, i18n.language, nowMs)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {post.kind !== 'update' ? (
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>{t(`feed.kind.${post.kind}`)}</Text>
          </View>
        ) : null}
      </Pressable>

      {post.media.length > 0 ? <MediaGallery items={post.media} bucket="media" /> : null}
      {post.kind === 'slots' && post.link?.preview && post.media.length === 0 ? <MediaGallery items={[post.link.preview]} bucket="media" /> : null}
      {post.body ? <Body>{post.body}</Body> : null}

      {post.kind === 'offer' && post.offer ? (
        <>
          <Spacer size={8} />
          <Body muted>
            {post.offer.service_title}
            {post.offer.discount_pct ? ` · −${post.offer.discount_pct}%` : ''} · {fmt(discountedCents(post.offer.price_cents, post.offer.discount_pct))} · {post.offer.duration_min} min
          </Body>
          {!mine ? (
            <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: post.offer!.service_id, offerId: post.offer_id! } })} />
          ) : null}
        </>
      ) : null}

      {post.kind === 'slots' && post.link ? (
        <>
          <Spacer size={8} />
          <Body muted>
            {post.link.service_title} · {fmt(discountedCents(post.link.price_cents, post.link.discount_pct))} · {post.link.duration_min} min
          </Body>
          <Body muted>{post.link.days.map((d) => dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}</Body>
          {expired ? (
            <Body muted>{t('slotLinks.expired')}</Body>
          ) : !mine ? (
            <Button title={t('feed.seeSlots')} onPress={() => router.push({ pathname: '/s/[code]', params: { code: post.link!.code } })} />
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} style={styles.like}>
          <Text style={{ color: liked ? theme.danger : theme.muted, fontSize: 20 }}>{liked ? '♥' : '♡'}</Text>
          <Text style={{ color: theme.muted, fontWeight: '600' }}>{likes}</Text>
        </Pressable>
        {mine ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              if (!(await deletePost(post.id))) onDeleted();
            }}>
            <Text style={{ color: theme.muted, fontWeight: '600' }}>{t('feed.delete')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', fontSize: 14 },
  who: { flex: 1 },
  name: { fontWeight: '700', fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
