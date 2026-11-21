import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ProfileTap } from '@/components/ProfileTap';
import { OutcomeSheet } from '@/components/BookingSheets';
import { Emoji } from '@/components/Emoji';
import { ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyBookings, type MyBooking } from '@/lib/booking';
import { confirmAttended, isInProgress, loadSeenNoShows, markNoShowSeen, noShowLeftMs } from '@/lib/checkin';
import { fonts, useTheme } from '@/theme';

type Tab = 'upcoming' | 'past' | 'cancelled';
type Filter = 'all' | 'bought' | 'sold';

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
  const [filter, setFilter] = useState<Filter>('all');
  const [outcomeFor, setOutcomeFor] = useState<MyBooking | null>(null);
  const [seenNoShows, setSeenNoShows] = useState<string[]>([]);
  const [attendBusy, setAttendBusy] = useState<string | null>(null);
  const [attendError, setAttendError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSeenNoShows().then((list) => alive && setSeenNoShows(list));
    return () => {
      alive = false;
    };
  }, []);

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
    // con il check-in la sessione si conclude da sola: niente domanda sull'esito
    const pendingOutcome = list.filter((b) => b.status === 'confirmed' && !b.checked_in_at && b.seller_id === userId && new Date(b.ends_at).getTime() <= now);
    const inFilter = (b: MyBooking) => (filter === 'bought' ? b.client_id === userId : filter === 'sold' ? b.seller_id === userId : true);
    const base =
      tab === 'cancelled'
        ? list.filter((b) => b.status === 'cancelled')
        : tab === 'past'
          ? list.filter((b) => b.status !== 'cancelled' && !upcoming(b) && !pendingOutcome.includes(b))
          : list.filter(upcoming).sort(byStart);
    const shownList = base.filter(inFilter);
    return { shown: shownList, pending: pendingOutcome };
  }, [bookings, tab, filter, now, userId]);

  if (!bookings) return <LoadingView />;

  const mineOf = (b: MyBooking) => b.client_id === userId;
  const otherOf = (b: MyBooking) => (mineOf(b) ? { id: b.seller_id, name: b.seller_name ?? '—', avatar: b.seller_avatar } : { id: b.client_id, name: b.client_name ?? '—', avatar: b.client_avatar });
  const timeFmt = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const open = (b: MyBooking) => router.push({ pathname: '/session/[id]', params: { id: b.id } });

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  const groups = (() => {
    const out: { key: string; label: string; items: MyBooking[] }[] = [];
    for (const b of shown) {
      const d = new Date(b.starts_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(b);
      else {
        const text = dayLabel.format(d);
        out.push({ key, label: text.charAt(0).toUpperCase() + text.slice(1), items: [b] });
      }
    }
    return out;
  })();
  const empty = shown.length === 0 && pending.length === 0;
  const toggles: [Tab, string][] = [['upcoming', t('bookings.tabUpcoming')], ['past', t('bookings.tabPast')], ['cancelled', t('bookings.tabCancelled')]];
  const filters: [Filter, string][] = [['all', t('bookings.filterAll')], ['bought', t('bookings.filterBought')], ['sold', t('bookings.filterSold')]];
  const role = (b: MyBooking) => t(mineOf(b) ? 'bookings.roleBought' : 'bookings.roleSold');

  const sheetWho = (b: MyBooking) => ({ id: b.id, title: b.service_title, startsAt: b.starts_at, otherName: otherOf(b).name, otherAvatar: otherOf(b).avatar, otherSeed: otherOf(b).id });

  const next = [...(bookings ?? [])].filter((b) => b.status === 'confirmed' && new Date(b.ends_at).getTime() > now).sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0] ?? null;
  const nextLive = next ? isInProgress(next, now) : false;
  const liveMin = next?.checked_in_at ? Math.max(0, Math.floor((now - new Date(next.checked_in_at).getTime()) / 60_000)) : 0;
  // assenze segnate in automatico, ancora correggibili (venditore) o contestabili (cliente)
  const noShows = (bookings ?? []).filter((b) => noShowLeftMs(b, now) > 0 && !seenNoShows.includes(b.id));
  const dismissNoShow = (id: string) => {
    setSeenNoShows((l) => [id, ...l]);
    void markNoShowSeen(id);
  };
  const attended = async (b: MyBooking) => {
    setAttendBusy(b.id);
    setAttendError(null);
    const e = await confirmAttended(b.id);
    setAttendBusy(null);
    if (e) setAttendError(e);
    else setReloadKey((k) => k + 1);
  };
  const countdownText = (() => {
    if (!next) return '';
    const mins = Math.round((new Date(next.starts_at).getTime() - now) / 60000);
    if (mins <= 0) return t('bookings.nextNow');
    if (mins < 60) return t('bookings.nextInMin', { count: mins });
    if (mins < 24 * 60) return t('bookings.nextInHours', { h: Math.floor(mins / 60), m: mins % 60 });
    return t('bookings.nextInDays', { count: Math.round(mins / 1440) });
  })();

  return (
    <Screen tabs>
      <Text style={[styles.title, { color: theme.text }]}>{t('tabs.agenda')}</Text>
      <View style={[styles.tabsRow, { borderBottomColor: theme.fill }]}>
        {toggles.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={[styles.tabItem, tab === key && { borderBottomColor: theme.ink }]}>
            <Text style={[styles.tabText, { color: tab === key ? theme.text : theme.muted, fontFamily: tab === key ? fonts.semibold : fonts.medium }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.filters}>
        {filters.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.filter, { backgroundColor: filter === key ? theme.accent : theme.surface }]}>
            <Text style={[styles.filterText, { color: filter === key ? theme.onAccent : theme.text, fontFamily: filter === key ? fonts.semibold : fonts.medium }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {listError ? <ErrorText>{t(listError)}</ErrorText> : null}

      {tab === 'upcoming' && next ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/session/[id]', params: { id: next.id } })} style={[styles.countdown, { backgroundColor: theme.ink }]}>
          {nextLive && next.checked_in_at ? (
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.cdLabel, { color: theme.inkMuted }]}>{t('checkin.inProgressSince')}</Text>
              <Text style={[styles.liveBig, { color: theme.accent }]}>{`${liveMin}'`}</Text>
              <Text numberOfLines={1} style={[styles.cdSub, { color: theme.inkOn }]}>{next.service_title}</Text>
              <Text numberOfLines={1} style={[styles.cdSub, { color: theme.inkSoft }]}>
                {t('checkin.agendaLiveSub', { name: otherOf(next).name.split(' ')[0], time: timeFmt.format(new Date(next.checked_in_at)), end: timeFmt.format(new Date(next.ends_at)) })}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.cdLabel, { color: theme.accent }]}>{t('bookings.nextSession')}</Text>
              <Text style={[styles.cdBig, { color: theme.inkOn }]}>{countdownText}</Text>
              <Text numberOfLines={1} style={[styles.cdSub, { color: theme.inkOn }]}>{`${next.service_title} · ${otherOf(next).name.split(' ')[0]}`}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={22} color={theme.inkOn} />
        </Pressable>
      ) : null}

      {tab === 'upcoming'
        ? noShows.map((b) => {
            const seller = b.seller_id === userId;
            const name = otherOf(b).name.split(' ')[0];
            const hours = Math.max(1, Math.ceil(noShowLeftMs(b, now) / 3_600_000));
            return (
              <View key={b.id} style={[styles.noShow, { backgroundColor: theme.errorSoft }]}>
                <Pressable accessibilityRole="button" onPress={() => open(b)} style={styles.noShowHead}>
                  <View style={[styles.noShowIcon, { backgroundColor: theme.surface }]}>
                    <Ionicons name="person-remove-outline" size={22} color={theme.errorText} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.noShowTitle, { color: theme.errorText }]}>{t(seller ? 'checkin.noShowSellerTitle' : 'checkin.noShowClientTitle', { name })}</Text>
                    <Text style={[styles.noShowBody, { color: theme.text }]}>
                      {t(seller ? 'checkin.agendaNoShowSeller' : 'checkin.agendaNoShowClient', { title: b.service_title, time: timeFmt.format(new Date(b.starts_at)), count: hours })}
                    </Text>
                  </View>
                </Pressable>
                {attendError && attendBusy === null ? <ErrorText>{t(attendError)}</ErrorText> : null}
                <View style={styles.noShowBtns}>
                  {seller ? (
                    <Pressable accessibilityRole="button" disabled={attendBusy === b.id} onPress={() => void attended(b)} style={[styles.noShowBtn, { backgroundColor: theme.ink }]}>
                      <Text style={[styles.noShowBtnText, { color: theme.inkOn }]}>{t('checkin.attended')}</Text>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" onPress={() => open(b)} style={[styles.noShowBtn, { backgroundColor: theme.ink }]}>
                      <Text style={[styles.noShowBtnText, { color: theme.inkOn }]}>{t('checkin.dispute')}</Text>
                    </Pressable>
                  )}
                  <Pressable accessibilityRole="button" onPress={() => dismissNoShow(b.id)} style={[styles.noShowBtn, { backgroundColor: theme.surface }]}>
                    <Text style={[styles.noShowBtnText, { color: theme.text }]}>{t(seller ? 'checkin.wasAbsent' : 'checkin.okGotIt')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        : null}

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

      {groups.map((g) => (
        <View key={g.key}>
          <Text style={[styles.dayHeader, { color: theme.muted }]}>{g.label}</Text>
          <View style={[styles.list, { backgroundColor: theme.surface }]}>
            {g.items.map((b, i) => {
              const o = otherOf(b);
              const sub = `${timeFmt.format(new Date(b.starts_at))} · ${o.name.split(' ')[0]} · ${role(b)}${tab === 'upcoming' ? '' : ` · ${t(`bookings.status.${b.status}`)}`}${b.package_id ? ` · ${t('bookings.package')}` : ''}`;
              return (
                <Pressable key={b.id} accessibilityRole="button" onPress={() => open(b)} style={[styles.item, i > 0 && { borderTopWidth: 1, borderTopColor: theme.fill }]}>
                  <ProfileTap userId={o.id}><Avatar name={o.name} seed={o.id} size={44} path={o.avatar} /></ProfileTap>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.itemTitle, { color: theme.text }]}>{b.service_title}</Text>
                    <Text numberOfLines={1} style={[styles.itemSub, { color: theme.muted }]}>{sub}</Text>
                  </View>
                  {isInProgress(b, now) ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                      <Text style={[styles.badgeText, { color: theme.onAccent }]}>{t('checkin.inProgress')}</Text>
                    </View>
                  ) : b.status === 'no_show' ? (
                    <View style={[styles.badge, { backgroundColor: theme.errorSoft }]}>
                      <Text style={[styles.badgeText, { color: theme.errorText }]}>{t('checkin.absent')}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={theme.muted} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {empty && (tab !== 'upcoming' || noShows.length === 0) ? (
        <View style={[styles.empty, { backgroundColor: theme.surface }]}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.bg }]}>
            <Emoji name="stopwatch" size={60} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t(tab === 'upcoming' ? 'bookings.emptyTitle' : tab === 'past' ? 'bookings.emptyPastTitle' : 'bookings.emptyCancelledTitle')}</Text>
          <Text style={[styles.emptyBody, { color: theme.muted }]}>{t(tab === 'upcoming' ? 'bookings.emptyBody' : tab === 'past' ? 'bookings.emptyPastBody' : 'bookings.emptyCancelledBody')}</Text>
          {tab === 'upcoming' ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace('/services')} style={[styles.emptyBtn, { backgroundColor: theme.ink }]}>
              <Text style={[styles.nextMainText, { color: '#FFFFFF' }]}>{t('bookings.emptyCta')}</Text>
            </Pressable>
          ) : null}
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
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 28, padding: 18 },
  cdLabel: { fontFamily: fonts.semibold, fontSize: 13 },
  cdBig: { fontFamily: fonts.semibold, fontSize: 28, letterSpacing: -1 },
  cdSub: { fontFamily: fonts.regular, fontSize: 14, opacity: 0.8 },
  liveBig: { fontFamily: fonts.semibold, fontSize: 56, lineHeight: 54, letterSpacing: -3.4, fontVariant: ['tabular-nums'] },
  noShow: { borderRadius: 32, padding: 16, gap: 12, marginTop: 12 },
  noShowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noShowIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  noShowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  noShowBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  noShowBtns: { flexDirection: 'row', gap: 8 },
  noShowBtn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  noShowBtnText: { fontFamily: fonts.semibold, fontSize: 15 },
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 32, letterSpacing: -1.2, marginTop: 8, paddingHorizontal: 4 },
  tabsRow: { flexDirection: 'row', gap: 22, marginTop: 10, marginHorizontal: 4, borderBottomWidth: 1 },
  tabItem: { paddingBottom: 9, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 14, paddingHorizontal: 4 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 14 },
  dayHeader: { fontFamily: fonts.medium, fontSize: 13, marginTop: 10, marginBottom: 6, marginLeft: 6 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 32, padding: 16, marginBottom: 12 },
  pendingTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  pendingSub: { fontFamily: fonts.medium, fontSize: 13 },
  nextMainText: { fontFamily: fonts.semibold, fontSize: 16 },
  list: { borderRadius: 26, padding: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  itemTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  itemSub: { fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  empty: { borderRadius: 40, paddingVertical: 36, paddingHorizontal: 22, alignItems: 'center', gap: 20, marginTop: 8 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 30, letterSpacing: -1.1, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  emptyBtn: { height: 52, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
