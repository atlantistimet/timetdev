import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { PostCard } from '@/components/PostCard';
import { useAuth } from '@/lib/auth';
import { loadPostById, type Post } from '@/lib/feed';

export default function PostScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ post: Post | null; nowMs: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const post = id ? await loadPostById(id, session?.user.id ?? '') : null;
      if (alive) setState({ post, nowMs: Date.now() });
    })();
    return () => {
      alive = false;
    };
  }, [id, session?.user.id]);

  if (!state) return <LoadingView />;
  return (
    <Screen>
      {state.post ? (
        <PostCard post={state.post} userId={session?.user.id ?? ''} nowMs={state.nowMs} onDeleted={() => router.replace('/')} openComments />
      ) : (
        <>
          <Title>{t('feed.postNotFound')}</Title>
          <Body muted>{t('feed.postNotFoundHint')}</Body>
        </>
      )}
      <Spacer />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
