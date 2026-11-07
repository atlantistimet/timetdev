import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafetySheet } from '@/components/SafetySheet';
import { SheetModal } from '@/components/SheetModal';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Pressable, buzz } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { CommentsSection } from '@/components/CommentsSection';
import { timeAgo } from '@/lib/time';
import { Emoji } from '@/components/Emoji';
import { MediaCover } from '@/components/MediaView';
import { Body } from '@/components/ui';
import { formatEuro } from '@/lib/booking';
import { TagEditor } from '@/components/TagEditor';
import { answerTag, deletePost, setLike, type Post } from '@/lib/feed';
import { initials } from '@/lib/public-profile';
import { stars } from '@/lib/reviews';
import { postUrl, shareLink } from '@/lib/share';
import { discountedCents } from '@/lib/validity';
import { fonts, radius, useTheme } from '@/theme';

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

export function PostCard({ post, userId, nowMs, onDeleted, openComments = false, flush = false }: { post: Post; userId: string; nowMs: number; onDeleted: () => void; openComments?: boolean; flush?: boolean }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post.likes);
  const [showComments, setShowComments] = useState(openComments);
  const [commentCount, setCommentCount] = useState(post.comments);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [tags, setTags] = useState(post.tags);
  const [menu, setMenu] = useState<'menu' | 'tags' | null>(null);
  const [safety, setSafety] = useState(false);
  const mine = post.author_id === userId;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);

  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const toggleLike = async () => {
    const next = !liked;
    if (next) {
      heart.set(withSequence(withTiming(1.22, { duration: 120, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) })));
      buzz('light');
    }
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
    <View style={[styles.card, flush ? styles.cardFlush : null, { backgroundColor: theme.surface, borderBottomColor: theme.fill }]}>
      <View style={styles.head}>
      <Pressable accessibilityRole="button" onPress={openAuthor} style={styles.headMain}>
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
        <Pressable accessibilityRole="button" accessibilityLabel={t('feed.menu')} hitSlop={8} onPress={() => setMenu('menu')} style={styles.dots}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.text} />
          {myTag?.status === 'pending' ? <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
        </Pressable>
      </View>

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

      <View style={flush ? styles.bleed : null}><MediaCover items={media} bucket="media" flush={flush} /></View>

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
      <View style={[styles.actions, styles.pad]}>
        <View style={styles.counts}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.like')} accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} style={styles.count}>
            <Animated.View style={heartStyle}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.danger : theme.text} /></Animated.View>
            <Text style={[styles.countText, { color: theme.text }]}>{likes}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('comments.write')} onPress={() => setShowComments((v) => !v)} style={styles.count}>
            <Ionicons name="chatbubble-outline" size={21} color={theme.text} />
            <Text style={[styles.countText, { color: theme.text }]}>{commentCount}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('feed.share')} onPress={() => void share()} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={theme.text} />
          </Pressable>
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
      <SafetySheet visible={safety} onClose={() => setSafety(false)} entityType="post" entityId={post.id} userId={post.author_id} name={post.author.full_name} onDone={(w) => w === 'blocked' && onDeleted()} />
      <SheetModal visible={menu !== null}  onRequestClose={() => setMenu(null)}>
        <Pressable style={[styles.backdrop]} onPress={() => setMenu(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {menu === 'tags' ? (
              <>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('feed.menuTags')}</Text>
                <TagEditor postId={post.id} authorId={userId} tags={tags} onChange={setTags} />
              </>
            ) : null}
            {menu === 'menu' ? (
              <>
                {myTag?.status === 'pending' ? (
                  <>
                    <View style={[styles.invite, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.rowTitle, { color: theme.onAccent }]}>{t('feed.tagRequest', { name: post.author.full_name })}</Text>
                      <Text style={[styles.rowSub, { color: theme.onAccent }]}>{t('feed.menuInviteSub')}</Text>
                    </View>
                    <MenuRow icon="checkmark" label={t('feed.menuAccept')} onPress={() => { setMenu(null); void answer('accepted'); }} />
                    <MenuRow icon="close" label={t('feed.tagDecline')} onPress={() => { setMenu(null); void answer('declined'); }} />
                  </>
                ) : null}
                {mine ? <MenuRow icon="people-outline" label={t('feed.menuTags')} sub={pendingCount > 0 ? t('feed.tagsPending', { count: pendingCount }) : undefined} onPress={() => setMenu('tags')} /> : null}
                {myTag?.status === 'accepted' ? <MenuRow icon="person-remove-outline" label={t('feed.tagRemove')} sub={t('feed.menuRemoveSub')} onPress={() => { setMenu(null); void answer('removed'); }} /> : null}
                <MenuRow icon="share-outline" label={t('feed.share')} onPress={() => { setMenu(null); void share(); }} />
                {!mine ? <MenuRow icon="flag-outline" label={t('safety.reportOrBlock')} danger onPress={() => { setMenu(null); setSafety(true); }} /> : null}
                {mine ? <MenuRow icon="trash-outline" label={t('feed.menuDelete')} danger onPress={async () => { setMenu(null); if (!(await deletePost(post.id))) onDeleted(); }} /> : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </SheetModal>
    </View>
  );
}

function MenuRow({ icon, label, sub, danger, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; sub?: string; danger?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const color = danger ? theme.danger : theme.text;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.menuRow}>
      <Ionicons name={icon} size={22} color={color} style={{ width: 28 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 32, padding: 12, gap: 12, marginBottom: 14 },
  cardFlush: { borderRadius: 0, marginBottom: 0, paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  bleed: { marginHorizontal: -12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingTop: 4 },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '85%', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 30 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 18, marginBottom: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowSub: { fontFamily: fonts.regular, fontSize: 13 },
  invite: { borderRadius: 22, padding: 14, gap: 2, marginBottom: 4 },
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
