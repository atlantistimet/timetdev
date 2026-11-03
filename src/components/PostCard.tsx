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
import { initials } from '@/lib/public-profile';
import { stars } from '@/lib/reviews';
import { postUrl, shareLink } from '@/lib/share';
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

/** "Marco Rossi" → "Marco R." */
const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ''}.` : parts[0] ?? '';
};

/** Testo del post con le @menzioni cliccabili. */
function BodyText({ text, color, linkColor }: { text: string; color: string; linkColor: string }) {
  const parts = text.split(/(@[a-z0-9_.]{3,30})/g);
  return (
    <Text style={[styles.body, { color }]}>
      {parts.map((part, i) => {
        if (!/^@[a-z0-9_.]{3,30}$/.test(part)) return part;
        const handle = part.slice(1).replace(/\.+$/, '');
        const tail = part.slice(1 + handle.length);
        return (
          <Text key={i}>
            <Text onPress={() => router.push({ pathname: '/u/[handle]', params: { handle } })} style={{ color: linkColor, fontFamily: fonts.semibold }}>{`@${handle}`}</Text>
            {tail}
          </Text>
        );
      })}
    </Text>
  );
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
  const visibleTags = tags.filter((x) => x.status === 'accepted' && x.role !== 'collab');
  const collabNames = tags.filter((x) => x.status === 'accepted' && x.role === 'collab');
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
  type Banner = { emoji: string; title: string; sub: string; cta: string | null; go: (() => void) | null; unavailable: boolean };
  let banner: Banner | null = null;
  if (post.offer_id) {
    banner = post.offer
      ? { emoji: 'party_popper', title: post.offer.service_title, sub: `${offerPrice} · ${post.offer.duration_min} min${post.offer.discount_pct ? ` · -${post.offer.discount_pct}%` : ''}`, cta: `${t('book.reserve')}`, go: () => router.push({ pathname: '/book', params: { serviceId: post.offer!.service_id, offerId: post.offer_id! } }), unavailable: false }
      : { emoji: 'party_popper', title: t('feed.offerGone'), sub: '', cta: null, go: null, unavailable: true };
  } else if (post.slot_link_id) {
    banner = post.link && !expired && !post.link.deleted
      ? { emoji: 'stopwatch', title: post.link.service_title, sub: `${fmt(discountedCents(post.link.price_cents, post.link.discount_pct))} · ${post.link.duration_min} min`, cta: t('feed.seeSlots'), go: () => router.push({ pathname: '/s/[code]', params: { code: post.link!.code } }), unavailable: false }
      : { emoji: 'stopwatch', title: post.link?.service_title || t('feed.slotGone'), sub: '', cta: null, go: null, unavailable: true };
  } else if (post.service_id) {
    const sv = post.service;
    banner = sv
      ? { emoji: sv.kind === 'per_minute' ? 'telephone_receiver' : sv.kind === 'package' ? 'gift' : 'books', title: sv.title, sub: sv.kind === 'per_minute' ? `${fmt(sv.rate_cents_per_min ?? 0)}/min` : `${fmt(sv.price_cents ?? 0)}${sv.duration_min ? ` · ${sv.duration_min} min` : ''}`, cta: t('feed.discover'), go: () => router.push({ pathname: '/service/[id]', params: { id: sv.id } }), unavailable: false }
      : { emoji: 'books', title: t('feed.serviceGone'), sub: '', cta: null, go: null, unavailable: true };
  }
  const reviewName = post.review ? (post.review.public ? post.review.author_name : shortName(post.review.author_name)) : '';

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Pressable accessibilityRole="button" onPress={openAuthor} style={styles.head}>
        <Avatar name={post.author.full_name} seed={post.author_id} size={42} path={post.author.avatar_path} />
        <View style={styles.who}>
          <Text style={[styles.name, { color: theme.text }]}>
            {post.author.full_name}
            {collabNames.length > 0 ? <Text style={{ color: theme.muted, fontFamily: fonts.regular }}>{` ${t('feed.and')} ${collabNames.map((c) => c.full_name).join(', ')}`}</Text> : null}
          </Text>
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

      {post.review ? (
        <View style={[styles.review, { backgroundColor: theme.bg }]}>
          <Text style={[styles.stars, { color: theme.ink }]}>{stars(post.review.rating)}</Text>
          {post.review.body ? <Text style={[styles.reviewBody, { color: theme.text }]}>{`“${post.review.body}”`}</Text> : null}
          <View style={styles.reviewWho}>
            {post.review.public ? (
              <Avatar name={post.review.author_name} seed={post.review.id} size={28} path={post.review.author_avatar} />
            ) : (
              <View style={[styles.initials, { backgroundColor: theme.fill }]}>
                <Text style={[styles.initialsText, { color: theme.ink }]}>{initials(post.review.author_name)}</Text>
              </View>
            )}
            <Text style={[styles.sub, { color: theme.muted }]}>{reviewName}</Text>
          </View>
        </View>
      ) : null}

      <MediaCover items={media} bucket="media" />

      {post.body ? <BodyText text={post.body} color={theme.text} linkColor={theme.ink} /> : null}

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
      </View>
      {banner ? (
        <View style={[styles.banner, { backgroundColor: banner.unavailable ? theme.bg : theme.accent, opacity: banner.unavailable ? 0.7 : 1 }]}>
          <View style={[styles.bannerIcon, { backgroundColor: theme.surface }]}><Emoji name={banner.emoji} size={26} /></View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.bannerTitle, { color: banner.unavailable ? theme.muted : theme.onAccent }]}>{banner.title}</Text>
            <Text numberOfLines={1} style={[styles.sub, { color: banner.unavailable ? theme.muted : theme.onAccent }]}>{banner.unavailable ? t('feed.unavailable') : banner.sub}</Text>
          </View>
          {banner.cta && banner.go && !mine ? (
            <Pressable accessibilityRole="button" onPress={banner.go} style={[styles.cta, { backgroundColor: theme.ink }]}>
              <Text style={[styles.ctaText, { color: theme.inkOn }]}>{banner.cta}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
  review: { borderRadius: 24, padding: 14, gap: 8 },
  stars: { fontSize: 16, letterSpacing: 2 },
  reviewBody: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  reviewWho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  initials: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: fonts.semibold, fontSize: 11 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 24, padding: 10 },
  bannerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 15 },
});
