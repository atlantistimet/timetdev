import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { listNotifications, markAllRead, markRead, type Notif } from '@/lib/notifications';

type Loaded = { items: Notif[]; errorKey: string | null; nowMs: number };

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void listNotifications(userId).then((r) => alive && setLoaded({ ...r, nowMs: Date.now() }));
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  if (!loaded) return <LoadingView />;

  const when = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const text = (n: Notif) => {
    const p = n.payload as Record<string, string | number | undefined>;
    return t(`notifications.kind.${n.kind}`, {
      name: p.name ?? '',
      title: p.title ?? '',
      count: Number(p.count ?? 1),
      snippet: p.snippet ?? '',
      rating: p.rating ?? '',
      amount: formatEuro(Number(p.amount_cents ?? 0), i18n.language),
      refund: formatEuro(Number(p.refund_cents ?? 0), i18n.language),
      date: p.starts_at ? when(String(p.starts_at)) : p.ends_on ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date(String(p.ends_on))) : '',
      defaultValue: n.kind,
    });
  };

  const open = async (n: Notif) => {
    await markRead(n.id);
    const p = n.payload as Record<string, string | undefined>;
    switch (n.kind) {
      case 'booking_new':
      case 'booking_cancelled':
      case 'tip':
      case 'review':
        if (n.ref_id) router.push({ pathname: '/session/[id]', params: { id: n.ref_id } });
        break;
      case 'package_new':
        router.push('/bookings');
        break;
      case 'message':
        if (p.sender_id) router.push({ pathname: '/chat/[userId]', params: { userId: p.sender_id } });
        break;
      case 'comment':
      case 'tag_request':
      case 'tag_accepted':
        if (n.ref_id) router.push({ pathname: '/p/[id]', params: { id: n.ref_id } });
        break;
      case 'review_reply':
      case 'follow':
        if (p.handle) router.push({ pathname: '/u/[handle]', params: { handle: p.handle } });
        break;
      case 'availability_expiring':
        router.push('/availability');
        break;
      default:
        setReloadKey((k) => k + 1);
    }
  };

  return (
    <Screen>
      <Title>{t('notifications.title')}</Title>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {!loaded.errorKey && loaded.items.length === 0 ? <Body muted>{t('notifications.empty')}</Body> : null}
      {loaded.items.some((n) => !n.read_at) ? (
        <>
          <Button
            title={t('notifications.markAll')}
            variant="ghost"
            onPress={async () => {
              if (userId) await markAllRead(userId);
              setReloadKey((k) => k + 1);
            }}
          />
          <Spacer size={8} />
        </>
      ) : null}
      {loaded.items.map((n) => (
        <Card key={n.id}>
          <Body>
            {n.read_at ? '' : '● '}
            {text(n)}
          </Body>
          <Body muted>{when(n.created_at)}</Body>
          <Spacer size={8} />
          <Button title={t('notifications.open')} variant="ghost" onPress={() => void open(n)} />
        </Card>
      ))}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
    </Screen>
  );
}
