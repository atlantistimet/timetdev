import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PostCard } from '@/components/PostCard';
import { Body, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadPosts, type Post } from '@/lib/feed';

export default function Home() {
  const { t } = useTranslation();
  const { session } = useAuth();
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
      <Title>{t('feed.title')}</Title>
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
