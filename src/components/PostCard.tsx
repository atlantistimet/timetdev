import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { CommentsSection } from '@/components/CommentsSection';
import { Emoji } from '@/components/Emoji';
import { MediaCover } from '@/components/MediaView';
import { Body, Button, Spacer } from '@/components/ui';
import { formatEuro } from '@/lib/booking';
import { TagEditor } from '@/components/TagEditor';
import { answerTag, deletePost, setLike, type Post } from '@/lib/feed';
import { postUrl, shareLink } from '@/lib/share';
import { dayLabel } from '@/lib/time';
import { discountedCents } from '@/lib/validity';
import { fonts, radius, useTheme } from '@/theme';

// Intl.RelativeTimeFormat non esiste nel motore JS del telefono (Hermes): formato a mano.
function timeAgo(iso: string, language: string, nowMs: number): string {
  const it = language.startsWith('it');
  const diff = (new Date(iso).getTime() - nowMs) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return it ? 'adesso' : 'now';
  const [n, unit] =
    abs < 3600 ? [Math.round(abs / 60), it ? 'min' : 'min'] :
    abs < 86_400 ? [Math.round(abs / 3600), it ? 'h' : 'h'] :
    [Math.round(abs / 86_400), it ? 'g' : 'd'];
  if (diff > 0) return it ? `tra ${n} ${unit}` : `in ${n} ${unit}`;
  return it ? `${n} ${unit} fa` : `${n} ${unit} ago`;
}

export function PostCard({ post, userId, nowMs, onDeleted, openComments = false }: { post: Post; userId: string; nowMs: number; onDeleted: () => void; openComments?: boolean }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [showComments, setShowComments] = useState(openComments);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [tags, setTags] = useState(post.tags);
  const [editingTags, setEditingTags] = useState(false);
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
  const myTag = tags.find((x) => x.tagged_id === userId);
  const answer = async (status: 'accepted' | 'declined' | 'removed') => {
    if ((await answerTag(post.id, userId, status)) !== null) return;
    setTags((l) => (status === 'accepted' ? l.map((x) => (x.tagged_id === userId ? { ...x, status: 'accepted' as const } : x)) : l.filter((x) => x.tagged_id !== userId)));
  };
  const visibleTags = tags.filter((x) => x.status === 'accepted');
  const pendingCount = tags.filter((x) => x.status === 'pending' && x.tagged_id !== userId).length;
  const share = async () => {
    const text = post.body ? `${post.author.full_name}: ${post.body.slice(0, 120)}` : post.author.full_name;
    const result = await shareLink(text, postUrl(post.id));
    setShareNote(result === 'copied' ? t('feed.linkCopied') : null);
  };
  const openAuthor = () => post.author.handle && router.push({ pathname: '/u/[handle]', params: { handle: post.author.handle } });

  const availableNow = !!post.author.available_until && new Date(post.author.available_until).getTime() > nowMs;
  const expired = !!post.link?.expires_at && new Date(post.link.expires_at).getTime() < nowMs;
  const media = post.media.length > 0 ? post.media : post.kind === 'slots' && post.link?.preview ? [post.link.preview] : [];
  const offerPrice = post.offer ? fmt(discountedCents(post.offer.price_cents, post.offer.discount_pct)) : null;
  const kindEmoji = post.kind === 'offer' ? 'party_popper' : post.kind === 'slots' ? 'stopwatch' : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="button" onPress={openAuthor} style={styles.head}>
        <Avatar name={post.author.full_name} seed={post.author_id} size={42} path={post.author.avatar_path} />
        <View style={styles.who}>
          <Text style={[styles.name, { color: theme.text }]}>{post.author.full_name}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {[post.author.role_title, timeAgo(post.created_at, i18n.language, nowMs)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {post.kind === 'offer' ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Emoji name={kindEmoji} size={16} />
            <Text style={[styles.badgeText, { color: theme.onAccent }]}>{t(`feed.kind.${post.kind}`)}</Text>
          </View>
        ) : post.kind === 'slots' ? (
          <Emoji name={kindEmoji} size={28} />
        ) : availableNow ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Text style={[styles.badgeText, { color: theme.onAccent }]}>{t('explore.availableNow')}</Text>
          </View>
        ) : null}
      </Pressable>

      <MediaCover items={media} bucket="media" />

      {post.kind === 'slots' && post.link ? (
        <View style={styles.pad}>
          <Text style={[styles.slotTitle, { color: theme.text }]}>{post.body || post.link.service_title}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {post.link.service_title} · {fmt(discountedCents(post.link.price_cents, post.link.discount_pct))} · {post.link.duration_min} min
          </Text>
          <Text style={[styles.sub, { color: theme.muted }]}>{post.link.days.map((d) => dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}</Text>
        </View>
      ) : post.body ? (
        <Text style={[styles.body, { color: theme.text }]}>{post.body}</Text>
      ) : null}

      {visibleTags.length > 0 ? (
        <Text style={[styles.pad, { color: theme.muted, fontSize: 13, fontFamily: fonts.medium }]}>
          {t('feed.with')}{' '}
          {visibleTags.map((x, i) => (
            <Text key={x.tagged_id} onPress={() => x.handle && router.push({ pathname: '/u/[handle]', params: { handle: x.handle } })} style={{ color: theme.text, fontFamily: fonts.semibold }}>
              {x.full_name}
              {i < visibleTags.length - 1 ? ', ' : ''}
            </Text>
          ))}
        </Text>
      ) : null}
      {mine && pendingCount > 0 ? <Text style={[styles.pad, { color: theme.muted, fontSize: 12 }]}>{t('feed.tagsPending', { count: pendingCount })}</Text> : null}
      {mine ? (
        <>
          <Button title={editingTags ? t('feed.tagEditDone') : t('feed.tagEdit')} variant="ghost" onPress={() => setEditingTags((v) => !v)} />
          {editingTags ? <TagEditor postId={post.id} authorId={userId} tags={tags} onChange={setTags} /> : null}
        </>
      ) : null}
      {myTag?.status === 'pending' ? (
        <>
          <Spacer size={4} />
          <Body>{t('feed.tagRequest', { name: post.author.full_name })}</Body>
          <Button title={t('feed.tagAccept')} onPress={() => void answer('accepted')} />
          <Button title={t('feed.tagDecline')} variant="ghost" onPress={() => void answer('declined')} />
        </>
      ) : null}
      {myTag?.status === 'accepted' ? <Button title={t('feed.tagRemove')} variant="ghost" onPress={() => void answer('removed')} /> : null}

      <View style={[styles.actions, styles.pad]}>
        <View style={styles.counts}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.like')} accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} style={styles.count}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.danger : theme.text} />
            <Text style={[styles.countText, { color: theme.text }]}>{likes}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('comments.write')} onPress={() => setShowComments((v) => !v)} style={styles.count}>
            <Ionicons name="chatbubble-outline" size={21} color={theme.text} />
            <Text style={[styles.countText, { color: theme.text }]}>{commentCount}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.share')} onPress={() => void share()} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </Pressable>
          {mine ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('feed.delete')}
              hitSlop={8}
              onPress={async () => {
                if (!(await deletePost(post.id))) onDeleted();
              }}>
              <Ionicons name="trash-outline" size={21} color={theme.muted} />
            </Pressable>
          ) : null}
        </View>
        {post.kind === 'offer' && post.offer && !mine ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/book', params: { serviceId: post.offer!.service_id, offerId: post.offer_id! } })}
            style={[styles.cta, { backgroundColor: theme.ink }]}>
            <Text style={[styles.ctaText, { color: theme.inkOn }]}>{`${t('book.reserve')} · ${offerPrice}`}</Text>
          </Pressable>
        ) : post.kind === 'slots' && post.link && !mine && !expired ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/s/[code]', params: { code: post.link!.code } })} style={[styles.cta, { backgroundColor: theme.ink }]}>
            <Text style={[styles.ctaText, { color: theme.inkOn }]}>{t('feed.seeSlots')}</Text>
          </Pressable>
        ) : post.kind === 'slots' && expired ? (
          <Text style={[styles.sub, { color: theme.muted }]}>{t('slotLinks.expired')}</Text>
        ) : null}
      </View>
      {shareNote ? <Body muted>{shareNote}</Body> : null}
      {showComments ? <CommentsSection postId={post.id} userId={userId} postAuthorId={post.author_id} onChanged={setCommentCount} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 32, padding: 12, gap: 12, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingTop: 4 },
  who: { flex: 1 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  sub: { fontFamily: fonts.medium, fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13 },
  pad: { paddingHorizontal: 4 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, paddingHorizontal: 4 },
  slotTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontFamily: fonts.medium, fontSize: 15 },
  cta: { height: 40, paddingHorizontal: 18, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fonts.semibold, fontSize: 15 },
});
