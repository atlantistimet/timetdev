import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { OutcomeSheet } from '@/components/BookingSheets';
import { Emoji } from '@/components/Emoji';
import { ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyBookings, type MyBooking } from '@/lib/booking';
import { fonts, pastelFor, useTheme } from '@/theme';

type Tab = 'upcoming' | 'received' | 'past';

export default function BookingsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [outcomeFor, setOutcomeFor] = useState<MyBooking | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await listMyBookings();
      if (!active) return;
      setBookings(r.bookings);
      setListError(r.errorKey);
      setNow(Date.now());
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { shown, pending } = useMemo(() => {
    const list = bookings ?? [];
    const upcoming = (b: MyBooking) => b.status === 'confirmed' && new Date(b.ends_at).getTime() > now;
    const byStart = (a: MyBooking, b: MyBooking) => a.starts_at.localeCompare(b.starts_at);
    const pendingOutcome = list.filter((b) => b.status === 'confirmed' && b.seller_id === userId && new Date(b.ends_at).getTime() <= now);
    const shownList =
      tab === 'past' ? list.filter((b) => !upcoming(b) && !pendingOutcome.includes(b)) : tab === 'received' ? list.filter((b) => b.seller_id === userId && upcoming(b)).sort(byStart) : list.filter(upcoming).sort(byStart);
    return { shown: shownList, pending: pendingOutcome };
  }, [bookings, tab, now, userId]);

  if (!bookings) return <LoadingView />;

  const mineOf = (b: MyBooking) => b.client_id === userId;
  const otherOf = (b: MyBooking) => (mineOf(b) ? { id: b.seller_id, name: b.seller_name ?? '—', avatar: b.seller_avatar } : { id: b.client_id, name: b.client_name ?? '—', avatar: b.client_avatar });
  const timeFmt = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const dayShort = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const minutesOf = (b: MyBooking) => Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
  const meta = (b: MyBooking) => `${timeFmt.format(new Date(b.starts_at))} · ${minutesOf(b)} min · ${t(`bookings.placeShort.${b.place}`)}`;
  const open = (b: MyBooking) => router.push({ pathname: '/session/[id]', params: { id: b.id } });

  const countdown = (b: MyBooking) => {
    const ms = new Date(b.starts_at).getTime() - now;
    if (ms <= 0) return t('bookings.inProgress');
    const mins = Math.ceil(ms / 60_000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d >= 1) return `${d} g ${h} h`;
    if (h >= 1) return `${h} h ${String(m).padStart(2, '0')}'`;
    return `${m}'`;
  };

  const featured = tab === 'upcoming' ? shown[0] : undefined;
  const rest = tab === 'upcoming' ? shown.slice(1) : shown;
  const empty = shown.length === 0 && pending.length === 0;
  const toggles: [Tab, string][] = [['upcoming', t('bookings.tabUpcoming')], ['received', t('bookings.tabReceived')], ['past', t('bookings.tabPast')]];

  const sheetWho = (b: MyBooking) => ({ id: b.id, title: b.service_title, startsAt: b.starts_at, otherName: otherOf(b).name, otherAvatar: otherOf(b).avatar, otherSeed: otherOf(b).id });

  return (
    <Screen tabs>
      <Text style={[styles.title, { color: theme.text }]}>{t('tabs.agenda')}</Text>
      <View style={[styles.toggle, { backgroundColor: theme.surface }]}>
        {toggles.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" onPress={() => setTab(key)} style={[styles.toggleItem, tab === key && { backgroundColor: theme.ink }]}>
            <Text style={[styles.toggleText, { color: tab === key ? '#FFFFFF' : theme.text, fontFamily: tab === key ? fonts.semibold : fonts.medium }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {listError ? <ErrorText>{t(listError)}</ErrorText> : null}

      {pending.map((b) => (
        <Pressable key={b.id} accessibilityRole="button" onPress={() => setOutcomeFor(b)} style={[styles.pending, { backgroundColor: theme.accent }]}>
          <Emoji name="raising_hands" size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.pendingTitle, { color: theme.onAccent }]}>{t('bookings.pendingTitle', { name: otherOf(b).name.split(' ')[0] })}</Text>
            <Text style={[styles.pendingSub, { color: theme.onAccent }]}>{b.service_title}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.onAccent} />
        </Pressable>
      ))}

      {featured ? (
        <View style={[styles.next, { backgroundColor: pastelFor(otherOf(featured).id) }]}>
          <View style={styles.nextTop}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.nextSmall, { color: theme.ink }]}>{t('bookings.nextIn')}</Text>
              <Text style={[styles.nextBig, { color: theme.ink }]}>{countdown(featured)}</Text>
            </View>
            <Avatar name={otherOf(featured).name} seed={otherOf(featured).id} size={72} round={26} path={otherOf(featured).avatar} />
          </View>
          <View>
            <Text numberOfLines={2} style={[styles.nextTitle, { color: theme.ink }]}>{featured.service_title}</Text>
            <Text style={[styles.nextSub, { color: theme.ink }]}>{`${t('bookings.withShort', { name: otherOf(featured).name.split(' ')[0] })} · ${dayShort.format(new Date(featured.starts_at))} ${new Date(featured.starts_at).getDate()} · ${meta(featured)}`}</Text>
          </View>
          <View style={styles.nextButtons}>
            <Pressable accessibilityRole="button" onPress={() => open(featured)} style={[styles.nextMain, { backgroundColor: theme.ink }]}>
              <Text style={[styles.nextMainText, { color: '#FFFFFF' }]}>{t('bookings.openSession')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('bookings.writeTo', { name: otherOf(featured).name })} onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: otherOf(featured).id } })} style={[styles.nextChat, { backgroundColor: theme.surface }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.ink} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {rest.length > 0 ? (
        <>
          {featured ? <Text style={[styles.h2, { color: theme.text }]}>{t('bookings.later')}</Text> : null}
          <View style={[styles.list, { backgroundColor: theme.surface }]}>
            {rest.map((b, i) => {
              const o = otherOf(b);
              const d = new Date(b.starts_at);
              const sub = tab === 'past' ? `${new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(d)} · ${t(`bookings.status.${b.status}`)}` : meta(b) + (b.package_id ? ` · ${t('bookings.package')}` : '');
              return (
                <Pressable key={b.id} accessibilityRole="button" onPress={() => open(b)} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: theme.fill }]}>
                  <View style={[styles.dateTile, { backgroundColor: theme.bg }]}>
                    <Text style={[styles.dateSmall, { color: theme.muted }]}>{dayShort.format(d)}</Text>
                    <Text style={[styles.dateBig, { color: theme.text }]}>{d.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.itemTitle, { color: theme.text }]}>{b.service_title}</Text>
                    <Text numberOfLines={1} style={[styles.itemSub, { color: theme.muted }]}>{sub}</Text>
                  </View>
                  <Avatar name={o.name} seed={o.id} size={40} path={o.avatar} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {empty ? (
        <View style={[styles.empty, { backgroundColor: theme.surface }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.bg }]}>
            <Emoji name="stopwatch" size={60} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('bookings.emptyTitle')}</Text>
          <Text style={[styles.emptyBody, { color: theme.muted }]}>{t('bookings.emptyBody')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/services')} style={[styles.emptyBtn, { backgroundColor: theme.ink }]}>
            <Text style={[styles.nextMainText, { color: '#FFFFFF' }]}>{t('bookings.emptyCta')}</Text>
          </Pressable>
        </View>
      ) : null}

      {outcomeFor ? (
        <OutcomeSheet
          who={sheetWho(outcomeFor)}
          minutesAgo={Math.round((now - new Date(outcomeFor.ends_at).getTime()) / 60_000)}
          onClose={() => setOutcomeFor(null)}
          onDone={() => {
            setOutcomeFor(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.semibold, fontSize: 36, letterSpacing: -1.4, marginTop: 8, paddingHorizontal: 4 },
  toggle: { flexDirection: 'row', padding: 4, borderRadius: 999, alignSelf: 'flex-start', marginVertical: 8 },
  toggleItem: { height: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 32, padding: 16, marginBottom: 12 },
  pendingTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  pendingSub: { fontFamily: fonts.medium, fontSize: 13 },
  next: { borderRadius: 38, padding: 18, gap: 14, marginBottom: 8 },
  nextTop: { flexDirection: 'row', alignItems: 'flex-start' },
  nextSmall: { fontFamily: fonts.medium, fontSize: 14 },
  nextBig: { fontFamily: fonts.semibold, fontSize: 56, lineHeight: 56, letterSpacing: -3.3 },
  nextTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  nextSub: { fontFamily: fonts.medium, fontSize: 14, marginTop: 2 },
  nextButtons: { flexDirection: 'row', gap: 8 },
  nextMain: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  nextMainText: { fontFamily: fonts.semibold, fontSize: 16 },
  nextChat: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  h2: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.45, marginTop: 8, marginBottom: 8, paddingHorizontal: 4 },
  list: { borderRadius: 30, padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  dateTile: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dateSmall: { fontFamily: fonts.regular, fontSize: 11 },
  dateBig: { fontFamily: fonts.semibold, fontSize: 20 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  itemSub: { fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  empty: { borderRadius: 40, paddingVertical: 36, paddingHorizontal: 22, alignItems: 'center', gap: 20, marginTop: 8 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 30, letterSpacing: -1.1, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyBtn: { height: 52, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
