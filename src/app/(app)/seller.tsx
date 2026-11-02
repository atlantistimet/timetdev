import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { AvailableNowCard } from '@/components/AvailableNowCard';
import { Button, ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cleanTitle, formatEuro, listMyBookings, type MyBooking } from '@/lib/booking';
import { loadSellerStats, setAvailableNow } from '@/lib/explore';
import { loadSellerAccount, openStripeOnboarding, requestOnboardingUrl, sellerState, type SellerAccount } from '@/lib/seller';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

const MENU: { key: string; icon: keyof typeof Ionicons.glyphMap; labelKey: string; href: string }[] = [
  { key: 'services', icon: 'briefcase-outline', labelKey: 'myServices.title', href: '/my-services' },
  { key: 'offers', icon: 'pricetags-outline', labelKey: 'offers.title', href: '/my-offers' },
  { key: 'links', icon: 'paper-plane-outline', labelKey: 'slotLinks.title', href: '/slot-links' },
  { key: 'avail', icon: 'calendar-outline', labelKey: 'availability.link', href: '/availability' },
  { key: 'policy', icon: 'shield-checkmark-outline', labelKey: 'policy.title', href: '/policies' },
  { key: 'profile', icon: 'person-outline', labelKey: 'profileEdit.link', href: '/profile-edit' },
];

const minutesOf = (b: MyBooking) => Math.max(0, Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000));

export default function SellerScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [account, setAccount] = useState<{ account: SellerAccount | null; errorKey: string | null } | null>(null);
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [rating, setRating] = useState<{ avg: number | null; count: number }>({ avg: null, count: 0 });
  const [until, setUntil] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [acc, list, stats, prof] = await Promise.all([
      loadSellerAccount(userId ?? ''),
      listMyBookings(),
      loadSellerStats([userId ?? '']),
      supabase.from('profiles').select('available_until').eq('id', userId ?? '').maybeSingle(),
    ]);
    return { acc, list, stats, prof };
  }, [userId]);
  type Loaded = Awaited<ReturnType<typeof fetchAll>>;

  const apply = useCallback(
    (r: Loaded) => {
      if (!userId) return;
      setAccount(r.acc);
      setBookings(r.list.bookings.filter((b) => b.seller_id === userId));
      setRating({ avg: r.stats[userId]?.rating_avg ?? null, count: r.stats[userId]?.reviews_count ?? 0 });
      setUntil((r.prof.data as { available_until: string | null } | null)?.available_until ?? null);
      setNowMs(Date.now());
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const r = await fetchAll();
      if (alive) apply(r);
    })();
    return () => {
      alive = false;
    };
  }, [userId, fetchAll, apply]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    setStartErrorKey(null);
    const { url, errorKey } = await requestOnboardingUrl();
    if (url) openStripeOnboarding(url);
    else setStartErrorKey(errorKey);
    setStarting(false);
  }, []);

  const summary = useMemo(() => {
    const d = new Date(nowMs);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const sunday = monday + 7 * 86_400_000;
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 86_400_000;
    const live = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
    const week = live.filter((b) => {
      const s = new Date(b.starts_at).getTime();
      return s >= monday && s < sunday;
    });
    const cents = week.reduce((sum, b) => sum + b.price_cents + b.extra_cents - b.seller_fee_cents, 0);
    const minutes = week.reduce((sum, b) => sum + minutesOf(b), 0);
    const upcoming = bookings
      .filter((b) => b.status === 'confirmed' && new Date(b.ends_at).getTime() > nowMs)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const today = upcoming.filter((b) => new Date(b.starts_at).getTime() < dayEnd && new Date(b.starts_at).getTime() >= dayStart - 86_400_000);
    return { cents, minutes, next: upcoming[0] ?? null, today };
  }, [bookings, nowMs]);

  if (!account || !userId) return <LoadingView />;

  const state = sellerState(account.account);
  const available = !!until && new Date(until).getTime() > nowMs;
  const toggle = async () => {
    await setAvailableNow(userId, available ? null : 2);
    apply(await fetchAll());
  };

  const countdown = (() => {
    if (!summary.next) return null;
    const diff = new Date(summary.next.starts_at).getTime() - nowMs;
    if (diff <= 0) return null;
    const m = Math.ceil(diff / 60000);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  })();
  const hours = (summary.minutes / 60).toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{t('seller.panel.title')}</Text>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: available }} accessibilityLabel={t('explore.availability')} onPress={() => void toggle()} style={styles.switchWrap}>
          <View style={[styles.track, { backgroundColor: available ? theme.ink : theme.fill, justifyContent: available ? 'flex-end' : 'flex-start' }]}>
            <View style={[styles.knob, { backgroundColor: available ? theme.accent : theme.surface }]} />
          </View>
          <Text style={[styles.switchLabel, { color: theme.text }]}>{available ? t('seller.panel.available') : t('seller.panel.unavailable')}</Text>
        </Pressable>
      </View>

      {state !== 'ready' ? (
        <View style={[styles.stripe, { backgroundColor: theme.accent }]}>
          <Text style={[styles.stripeText, { color: theme.onAccent }]}>{t(`seller.state.${state}`)}</Text>
          <Button title={t(state === 'none' ? 'seller.start' : 'seller.continue')} onPress={() => void start()} loading={starting} />
          {startErrorKey ? <ErrorText>{t(startErrorKey)}</ErrorText> : null}
        </View>
      ) : null}
      {account.errorKey ? <ErrorText>{t(account.errorKey)}</ErrorText> : null}

      <View style={[styles.next, { backgroundColor: theme.ink }]}>
        <View style={styles.flex}>
          {summary.next ? (
            <>
              <Text style={[styles.nextLabel, { color: theme.inkMuted }]}>{countdown ? t('seller.panel.nextIn') : t('seller.panel.inProgress')}</Text>
              <Text style={[styles.nextBig, { color: theme.accent }]}>{countdown ?? '●'}</Text>
              <Text style={styles.nextWho} numberOfLines={1}>
                {summary.next.client_name ?? ''} · {cleanTitle(summary.next.service_title)}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.nextLabel, { color: theme.inkMuted }]}>{t('seller.panel.nextIn')}</Text>
              <Text style={[styles.nextBig, { color: theme.accent }]}>--:--</Text>
              <Text style={styles.nextWho}>{t('seller.panel.noNext')}</Text>
            </>
          )}
        </View>
        {summary.next ? <Avatar name={summary.next.client_name ?? ''} seed={summary.next.client_id} size={72} round={26} path={summary.next.client_avatar} /> : null}
      </View>

      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: theme.accent }]}>
          <Text style={[styles.tileBig, { color: theme.onAccent }]}>{formatEuro(summary.cents, i18n.language).replace(/[,.]00(?=\D|$)/, '')}</Text>
          <Text style={[styles.tileSmall, { color: theme.onAccent }]}>{t('seller.panel.week')}</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: theme.surface }]}>
          <Text style={[styles.tileBig, { color: theme.text }]}>{hours} h</Text>
          <Text style={[styles.tileSmall, { color: theme.muted }]}>{t('seller.panel.sold')}</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: theme.surface }]}>
          <Text style={[styles.tileBig, { color: theme.text }]}>{rating.avg ? rating.avg.toLocaleString(i18n.language, { maximumFractionDigits: 1 }) : '–'}</Text>
          <Text style={[styles.tileSmall, { color: theme.muted }]}>{t('seller.panel.reviews', { count: rating.count })}</Text>
        </View>
      </View>

      <View style={[styles.list, { backgroundColor: theme.surface }]}>
        {summary.today.map((b, i) => (
          <Pressable key={b.id} onPress={() => router.push(`/session/${b.id}`)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
            <Text style={[styles.time, { color: theme.text }]}>{timeOf(b.starts_at)}</Text>
            <Avatar name={b.client_name ?? ''} seed={b.client_id} size={40} round={20} path={b.client_avatar} />
            <View style={styles.flex}>
              <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                {b.client_name ?? ''}
              </Text>
              <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>
                {cleanTitle(b.service_title)} · {minutesOf(b)}{"'"}
              </Text>
            </View>
            <View style={[styles.pill, { backgroundColor: theme.successSoft }]}>
              <Text style={[styles.pillText, { color: theme.success }]}>{t('seller.panel.paid')}</Text>
            </View>
          </Pressable>
        ))}
        <View style={[styles.row, summary.today.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
          <View style={[styles.dashed, { borderColor: theme.muted }]} />
          <Text style={[styles.rowName, styles.flex, { color: theme.muted }]}>{t('seller.panel.free')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/slot-links')} style={[styles.send, { backgroundColor: theme.accent }]}>
            <Text style={[styles.sendText, { color: theme.onAccent }]}>{t('seller.panel.sendSlot')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.list, { backgroundColor: theme.surface }]}>
        {MENU.map((m, i) => (
          <Pressable key={m.key} accessibilityRole="button" onPress={() => router.push(m.href as never)} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
            <View style={[styles.icon, { backgroundColor: theme.bg }]}>
              <Ionicons name={m.icon} size={20} color={theme.text} />
            </View>
            <Text style={[styles.rowName, styles.flex, { color: theme.text }]}>{t(m.labelKey)}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Pressable>
        ))}
      </View>

      <AvailableNowCard key={String(until)} userId={userId} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/profile')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 36, letterSpacing: -1.4, lineHeight: 37 },
  switchWrap: { alignItems: 'center', gap: 6 },
  track: { width: 64, height: 38, borderRadius: 999, padding: 4, flexDirection: 'row', alignItems: 'center' },
  knob: { width: 30, height: 30, borderRadius: 999 },
  switchLabel: { fontFamily: fonts.semibold, fontSize: 12 },
  stripe: { borderRadius: 30, padding: 16, gap: 12, marginBottom: 10 },
  stripeText: { fontFamily: fonts.medium, fontSize: 14 },
  next: { borderRadius: 34, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  nextLabel: { fontFamily: fonts.regular, fontSize: 13 },
  nextBig: { fontFamily: fonts.semibold, fontSize: 58, letterSpacing: -3.4, lineHeight: 62 },
  nextWho: { fontFamily: fonts.regular, fontSize: 14, color: '#FFFFFF' },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tile: { flex: 1, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14 },
  tileBig: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: -1 },
  tileSmall: { fontFamily: fonts.medium, fontSize: 12 },
  list: { borderRadius: 30, padding: 6, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  time: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.6, width: 56 },
  rowName: { fontFamily: fonts.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.regular, fontSize: 13 },
  pill: { height: 26, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  dashed: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', },
  send: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  sendText: { fontFamily: fonts.semibold, fontSize: 14 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
