import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { supabase } from '@/lib/supabase';
import { CreateSheet } from '@/components/CreateSheet';
import { PostCard } from '@/components/PostCard';
import { Body, ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadPosts, type Post } from '@/lib/feed';
import { loadBlockedIds } from '@/lib/safety';
import { useUnreadCount } from '@/lib/notifications';
import { fonts, radius, useTheme } from '@/theme';

export default function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const [creating, setCreating] = useState(false);
  const userId = session?.user.id ?? null;
  const unread = useUnreadCount(userId);
  const [scope, setScope] = useState<'all' | 'following'>('all');
  const [loaded, setLoaded] = useState<{ posts: Post[]; errorKey: string | null; nowMs: number; scope: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [hour] = useState(() => new Date().getHours());
  const [me, setMe] = useState<{ name: string; avatar: string | null } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void supabase.from('profiles').select('full_name, avatar_path').eq('id', userId).maybeSingle().then(({ data }) => {
      if (alive && data) setMe({ name: (data.full_name as string | null) ?? '', avatar: (data.avatar_path as string | null) ?? null });
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const [scopeW, setScopeW] = useState(0);
  const pill = useSharedValue(0);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pill.get() * Math.max(scopeW - 8, 0) / 2 }] }));
  useEffect(() => {
    pill.set(withTiming(scope === 'all' ? 0 : 1, { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
  }, [scope, pill]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [r, blocked] = await Promise.all([loadPosts(userId, { kind: scope }), loadBlockedIds()]);
      r.posts = r.posts.filter((p) => !blocked.has(p.author_id));
      if (alive) setLoaded({ ...r, nowMs: Date.now(), scope });
    })();
    return () => {
      alive = false;
    };
  }, [userId, scope, reloadKey]);

  // Persone dei post recenti: prima chi è disponibile ora (anello nero), poi gli altri.
  const people = useMemo(() => {
    if (!loaded) return [];
    const seen = new Map<string, { id: string; name: string; handle: string | null; path: string | null; live: boolean }>();
    for (const p of loaded.posts) {
      if (p.author_id === userId || seen.has(p.author_id)) continue;
      seen.set(p.author_id, {
        id: p.author_id,
        name: p.author.full_name,
        handle: p.author.handle,
        path: p.author.avatar_path,
        live: !!p.author.available_until && new Date(p.author.available_until).getTime() > loaded.nowMs,
      });
    }
    return [...seen.values()].sort((a, b) => Number(b.live) - Number(a.live)).slice(0, 12);
  }, [loaded, userId]);

  if (!userId) return <LoadingView />;

  return (
    <Screen tabs flush>
      <View style={styles.top}>
      <View style={styles.header}>
        <View style={styles.hello}>
          <Text style={[styles.greet, { color: theme.muted }]}>{t(hour < 13 ? 'feed.greetMorning' : hour < 18 ? 'feed.greetAfternoon' : 'feed.greetEvening')}</Text>
          <View style={styles.nameRow}>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.helloText, { color: theme.text }]}>{(me?.name ?? '').split(' ')[0]}</Text>
            <Emoji name="waving_hand" size={30} />
          </View>
        </View>
        <View style={styles.headerBtns}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('notifications.title')} onPress={() => router.push('/notifications')} style={[styles.round, { backgroundColor: theme.surface }]}>
            <Ionicons name="notifications-outline" size={22} color={theme.text} />
            {unread > 0 ? <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('tabs.profile')} onPress={() => router.push('/profile')}>
            <Avatar name={me?.name || '?'} seed={userId} size={46} path={me?.avatar} />
          </Pressable>
        </View>
      </View>
      </View>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />

      {(
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('create.title')} onPress={() => setCreating(true)} style={styles.person}>
            <View style={[styles.addCircle, { backgroundColor: theme.accent }]}>
              <Ionicons name="add" size={30} color={theme.onAccent} />
            </View>
            <Text numberOfLines={1} style={[styles.personName, { color: theme.text }]}>{t('feed.create')}</Text>
          </Pressable>
          {people.map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => p.handle && router.push({ pathname: '/u/[handle]', params: { handle: p.handle } })} style={styles.person}>
              <View style={[styles.ring, p.live && { borderColor: theme.ink }]}>
                <Avatar name={p.name} seed={p.id} size={58} path={p.path} />
              </View>
              <Text numberOfLines={1} style={[styles.personName, { color: theme.text }]}>{p.name.split(/\s+/)[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.scopeWrap}>
      <View onLayout={(e) => setScopeW(e.nativeEvent.layout.width)} style={[styles.scope, { backgroundColor: theme.bg }]}>
        {scopeW > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, { width: (scopeW - 8) / 2, backgroundColor: theme.ink }, pillStyle]} /> : null}
        {(['all', 'following'] as const).map((s) => (
          <Pressable key={s} accessibilityRole="tab" accessibilityState={{ selected: scope === s }} onPress={() => setScope(s)} style={styles.scopeBtn}>
            <Text style={[styles.scopeText, { color: scope === s ? theme.inkOn : theme.text, fontFamily: scope === s ? fonts.semibold : fonts.medium }]}>{t(s === 'all' ? 'feed.all' : 'feed.following')}</Text>
          </Pressable>
        ))}
      </View>
      </View>

      {!loaded || loaded.scope !== scope ? (
        <View style={styles.pad}><Body muted>{t('common.loading')}</Body></View>
      ) : (
        <>
          {loaded.errorKey ? <View style={styles.pad}><ErrorText>{t(loaded.errorKey)}</ErrorText></View> : null}
          {!loaded.errorKey && loaded.posts.length === 0 ? <View style={styles.pad}><Body muted>{t(scope === 'following' ? 'feed.emptyFollowing' : 'feed.empty')}</Body></View> : null}
          {loaded.posts.map((post, i) => (
            <Animated.View key={post.id} entering={FadeInDown.delay(Math.min(i, 5) * 60).duration(320)}>
              <PostCard post={post} userId={userId} nowMs={loaded.nowMs} onDeleted={() => setReloadKey((k) => k + 1)} flush />
            </Animated.View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 20, paddingTop: 24 },
  pad: { paddingHorizontal: 20, paddingVertical: 12 },
  scopeWrap: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hello: { flex: 1, marginRight: 8 },
  greet: { fontFamily: fonts.medium, fontSize: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  helloText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 34, lineHeight: 38, letterSpacing: -1.3 },
  addCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 10, right: 11, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  people: { gap: 12, paddingVertical: 16, paddingHorizontal: 24 },
  person: { width: 64, alignItems: 'center', gap: 5 },
  ring: { padding: 3, borderRadius: 40, borderWidth: 2.5, borderColor: 'transparent' },
  personName: { fontFamily: fonts.medium, fontSize: 12 },
  scope: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, marginBottom: 14 },
  pill: { position: 'absolute', left: 4, top: 4, height: 38, borderRadius: radius.pill },
  scopeBtn: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  scopeText: { fontSize: 14 },
});
