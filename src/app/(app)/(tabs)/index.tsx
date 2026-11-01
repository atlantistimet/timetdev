import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PostCard } from '@/components/PostCard';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CreateSheet } from '@/components/CreateSheet';
import { Body, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadPosts, type Post } from '@/lib/feed';
import { fonts, useTheme } from '@/theme';

export default function Home() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const [creating, setCreating] = useState(false);
  const userId = session?.user.id ?? null;
  const [scope, setScope] = useState<'all' | 'following'>('all');
  const [loaded, setLoaded] = useState<{ posts: Post[]; errorKey: string | null; nowMs: number; scope: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const r = await loadPosts(userId, { kind: scope });
      if (alive) setLoaded({ ...r, nowMs: Date.now(), scope });
    })();
    return () => {
      alive = false;
    };
  }, [userId, scope, reloadKey]);

  if (!userId) return <LoadingView />;

  return (
    <Screen tabs>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Title>{t('feed.title')}</Title>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('create.title')}
          onPress={() => setCreating(true)}
          style={[styles.plus, { backgroundColor: theme.primary }]}>
          <Text style={[styles.plusText, { color: theme.onPrimary }]}>+</Text>
        </Pressable>
      </View>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
      <ChipRow>
        <Chip label={t('feed.all')} selected={scope === 'all'} onPress={() => setScope('all')} />
        <Chip label={t('feed.following')} selected={scope === 'following'} onPress={() => setScope('following')} />
      </ChipRow>
      {!loaded || loaded.scope !== scope ? (
        <Body muted>{t('common.loading')}</Body>
      ) : (
        <>
          {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
          {!loaded.errorKey && loaded.posts.length === 0 ? <Body muted>{t(scope === 'following' ? 'feed.emptyFollowing' : 'feed.empty')}</Body> : null}
          {loaded.posts.map((post) => (
            <PostCard key={post.id} post={post} userId={userId} nowMs={loaded.nowMs} onDeleted={() => setReloadKey((k) => k + 1)} />
          ))}
        </>
      )}
      <Spacer size={8} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1 },
  plus: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 30, lineHeight: 34, fontFamily: fonts.light },
});
