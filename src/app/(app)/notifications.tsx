import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { ErrorText, LoadingView, Screen } from '@/components/ui';
import { fonts, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { answerReviewPublicity, listNotifications, markAllRead, markRead, type Notif } from '@/lib/notifications';

type Loaded = { items: Notif[]; errorKey: string | null; nowMs: number };

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
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
        if (n.ref_id) router.push(n.ref_table === 'calls' ? { pathname: '/call/[id]', params: { id: n.ref_id } } : { pathname: '/session/[id]', params: { id: n.ref_id } });
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
      case 'review_shared':
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

  const EMOJI: Record<string, string> = {
    review_shared: 'star', booking_new: 'party_popper', package_new: 'gift', booking_cancelled: 'calendar', tip: 'money_bag', message: 'speech_balloon', comment: 'speech_balloon',
    follow: 'waving_hand', review: 'raising_hands', call_missed: 'telephone_receiver', availability_expiring: 'stopwatch', tag_request: 'heart_hands',
    review_reply: 'speech_balloon', tag_accepted: 'heart_hands',
  };
  const ago = (iso: string) => {
    const min = Math.max(0, Math.round((loaded.nowMs - new Date(iso).getTime()) / 60000));
    if (min < 1) return t('notifications.now');
    if (min < 60) return t('notifications.minAgo', { count: min });
    if (min < 1440) return t('notifications.hourAgo', { count: Math.round(min / 60) });
    return when(iso);
  };
  const day0 = new Date(loaded.nowMs).setHours(0, 0, 0, 0);
  const groupOf = (iso: string) => {
    const d = new Date(iso).getTime();
    return d >= day0 ? 'today' : d >= day0 - 86_400_000 ? 'yesterday' : 'earlier';
  };
  const groups = (['today', 'yesterday', 'earlier'] as const)
    .map((g) => ({ g, rows: loaded.items.filter((n) => groupOf(n.created_at) === g) }))
    .filter((x) => x.rows.length > 0);
  const hasUnread = loaded.items.some((n) => !n.read_at);

  return (
    <Screen back>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t('notifications.title')}</Text>
        {hasUnread ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              if (userId) await markAllRead(userId);
              setReloadKey((k) => k + 1);
            }}
            style={[styles.markAll, { backgroundColor: theme.surface }]}
          >
            <Text style={[styles.markAllText, { color: theme.text }]}>{t('notifications.markRead')}</Text>
          </Pressable>
        ) : null}
      </View>
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {!loaded.errorKey && loaded.items.length === 0 ? <Text style={[styles.empty, { color: theme.muted }]}>{t('notifications.empty')}</Text> : null}
      {groups.map(({ g, rows }) => (
        <View key={g} style={{ gap: 8 }}>
          <Text style={[styles.group, { color: theme.muted }]}>{t(`notifications.${g}`)}</Text>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {rows.map((n, i) => {
              const p = n.payload as Record<string, string | undefined>;
              const full = text(n);
              const name = typeof p.name === 'string' ? p.name : '';
              const bold = name && full.startsWith(name);
              return (
                <Pressable key={n.id} accessibilityRole="button" onPress={() => void open(n)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                  <View>
                    <Avatar name={name || '·'} path={p.avatar_path} seed={n.id} size={52} />
                    <View style={[styles.badge, { backgroundColor: theme.surface }]}>
                      <Emoji name={EMOJI[n.kind] ?? 'sparkles'} size={20} />
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.text, { color: theme.text }]}>
                      {bold ? <Text style={{ fontFamily: fonts.semibold }}>{name}</Text> : null}
                      {bold ? full.slice(name.length) : full}
                    </Text>
                    <Text style={[styles.when, { color: theme.muted }]}>{ago(n.created_at)}</Text>
                    {n.kind === 'review_shared' && !n.read_at && n.ref_id ? (
                      <View style={styles.answerRow}>
                        {[false, true].map((pub) => (
                          <Pressable
                            key={String(pub)}
                            accessibilityRole="button"
                            onPress={async () => {
                              if (await answerReviewPublicity(n.ref_id!, pub)) setReloadKey((k) => k + 1);
                            }}
                            style={[styles.answerBtn, { backgroundColor: pub ? theme.ink : theme.bg }]}
                          >
                            <Text style={[styles.answerText, { color: pub ? '#FFFFFF' : theme.text }]}>{pub ? t('notifications.showMe') : t('notifications.stayAnon')}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  {!n.read_at ? <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.ink }]} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1.2 },
  markAll: { height: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  markAllText: { fontFamily: fonts.medium, fontSize: 14 },
  empty: { fontFamily: fonts.regular, fontSize: 15 },
  group: { fontFamily: fonts.semibold, fontSize: 14, paddingHorizontal: 4 },
  card: { borderRadius: 30, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 10 },
  badge: { position: 'absolute', right: -6, bottom: -6, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  when: { fontFamily: fonts.regular, fontSize: 12 },
  answerRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  answerBtn: { height: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  answerText: { fontFamily: fonts.semibold, fontSize: 13 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
