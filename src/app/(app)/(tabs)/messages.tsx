import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { listConversations, type ConversationItem } from '@/lib/chat';
import { fonts, useTheme } from '@/theme';

type Filter = 'all' | 'unread' | 'clients';

export default function MessagesScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [clients, setClients] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const load = async () => {
      const list = await listConversations(me);
      if (alive) {
        setItems(list);
        setNow(Date.now());
      }
    };
    void load();
    // clienti = persone che hanno prenotato con me come venditore
    void supabase.from('bookings').select('client_id').eq('seller_id', me).then(({ data }) => {
      if (alive) setClients(new Set(((data ?? []) as { client_id: string }[]).map((b) => b.client_id)));
    });
    const channel = supabase
      .channel(`inbox-${me}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [me]);

  const unreadCount = useMemo(() => (items ?? []).filter((c) => c.unread > 0).length, [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((c) => (filter === 'unread' ? c.unread > 0 : filter === 'clients' ? clients.has(c.otherId) : true) && (!q || c.otherName.toLowerCase().includes(q) || c.lastBody.toLowerCase().includes(q)));
  }, [items, filter, clients, query]);

  if (!items) return <LoadingView />;

  const when = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(d);
    if (days === 1) return t('chat.yesterday');
    if (days < 7) return new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(d);
    return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(d);
  };
  const chips: [Filter, string][] = [['all', t('chat.filterAll')], ['unread', unreadCount ? `${t('chat.filterUnread')} · ${unreadCount}` : t('chat.filterUnread')], ['clients', t('chat.filterClients')]];

  return (
    <Screen tabs>
      <Text style={[styles.title, { color: theme.text }]}>{t('chat.title')}</Text>
      <View style={[styles.search, { backgroundColor: theme.surface }]}>
        <Ionicons name="search" size={20} color={theme.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('chat.search')} placeholderTextColor={theme.muted} style={[styles.searchInput, { color: theme.text }]} />
      </View>
      <View style={styles.chips}>
        {chips.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => setFilter(key)} style={[styles.chip, { backgroundColor: filter === key ? theme.ink : theme.surface }]}>
            <Text style={[styles.chipText, { color: filter === key ? '#FFFFFF' : theme.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {shown.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.surface }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.bg }]}>
            <Emoji name="speech_balloon" size={56} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('chat.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: theme.muted }]}>{t('chat.none')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/services')} style={[styles.emptyBtn, { backgroundColor: theme.ink }]}>
            <Text style={styles.emptyBtnText}>{t('bookings.emptyCta')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.list, { backgroundColor: theme.surface }]}>
          {shown.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: c.otherId } })} style={styles.row}>
              <View style={[c.availableNow && [styles.ring, { borderColor: theme.ink }]]}>
                <Avatar name={c.otherName} seed={c.otherId} size={54} path={c.otherAvatar} />
                {c.availableNow ? <View style={[styles.live, { backgroundColor: theme.accent, borderColor: theme.surface }]} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.line}>
                  <Text numberOfLines={1} style={[styles.name, { color: theme.text, fontFamily: c.unread ? fonts.semibold : fonts.medium, flex: 1 }]}>{c.otherName}</Text>
                  <Text style={[styles.time, { color: theme.muted }]}>{when(c.lastAt)}</Text>
                </View>
                <View style={styles.line}>
                  <Text numberOfLines={1} style={[styles.last, { color: c.unread ? theme.text : theme.muted, fontFamily: c.unread ? fonts.medium : fonts.regular, flex: 1 }]}>{c.lastBody}</Text>
                  {c.unread > 0 ? (
                    <View style={[styles.badge, { backgroundColor: theme.ink }]}>
                      <Text style={styles.badgeText}>{c.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.semibold, fontSize: 36, letterSpacing: -1.4, marginTop: 8, paddingHorizontal: 4 },
  search: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, marginTop: 12 },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16 },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  chipText: { fontFamily: fonts.medium, fontSize: 15 },
  list: { borderRadius: 32, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 24 },
  ring: { borderWidth: 2, borderRadius: 999, padding: 0 },
  live: { position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16 },
  time: { fontFamily: fonts.regular, fontSize: 12 },
  last: { fontSize: 14 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 12 },
  empty: { borderRadius: 40, paddingVertical: 36, paddingHorizontal: 22, alignItems: 'center', gap: 18 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 30, letterSpacing: -1.1, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyBtn: { height: 52, paddingHorizontal: 24, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 16 },
});
