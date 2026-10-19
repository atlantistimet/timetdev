import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, CardButton, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listConversations, type ConversationItem } from '@/lib/chat';

export default function MessagesScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [items, setItems] = useState<ConversationItem[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    (async () => {
      const list = await listConversations(me);
      if (alive) setItems(list);
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  if (!items) return <LoadingView />;
  return (
    <Screen>
      <Title>{t('chat.title')}</Title>
      <Spacer />
      {items.length === 0 ? <Body muted>{t('chat.none')}</Body> : null}
      {items.map((c) => (
        <CardButton
          key={c.id}
          title={c.unread > 0 ? `${c.otherName} (${c.unread})` : c.otherName}
          subtitle={c.lastBody.slice(0, 80)}
          onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: c.otherId } })}
        />
      ))}
      <Spacer />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
