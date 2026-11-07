import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ProfileTap } from '@/components/ProfileTap';
import { ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cleanTitle, formatEuro } from '@/lib/booking';
import { loadEarnings, type Earnings } from '@/lib/earnings';
import { openStripeOnboarding, requestOnboardingUrl } from '@/lib/seller';
import { fonts, useTheme } from '@/theme';

type Period = 'month' | 'year';

export default function EarningsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [period, setPeriod] = useState<Period>('month');
  const [result, setResult] = useState<{ data: Earnings | null; errorKey: string | null } | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [ref] = useState(() => new Date());

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const from = period === 'month' ? new Date(ref.getFullYear(), ref.getMonth(), 1) : new Date(ref.getFullYear(), 0, 1);
    const to = period === 'month' ? new Date(ref.getFullYear(), ref.getMonth() + 1, 1) : new Date(ref.getFullYear() + 1, 0, 1);
    (async () => {
      const r = await loadEarnings(userId, from.toISOString(), to.toISOString());
      if (alive) setResult(r);
    })();
    return () => {
      alive = false;
    };
  }, [userId, period, ref]);

  const stripe = useCallback(async () => {
    setOpening(true);
    setOpenError(null);
    const { url, errorKey } = await requestOnboardingUrl();
    if (url) openStripeOnboarding(url);
    else setOpenError(errorKey);
    setOpening(false);
  }, []);

  if (!result) return <LoadingView />;
  const data = result.data;
  const monthName = ref.toLocaleDateString(i18n.language, { month: 'long' });
  const periodName = period === 'month' ? monthName : String(ref.getFullYear());
  const money = (c: number) => formatEuro(Math.abs(c), i18n.language);
  const euro0 = (c: number) => formatEuro(c, i18n.language).replace(/[,.]00(?=\D|$)/, '');
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  const what = (m: NonNullable<typeof data>['movements'][number]) => {
    if (m.kind === 'call') return t('earnings.call', { minutes: m.minutes ?? 0 });
    if (m.kind === 'package') return t('earnings.package');
    if (m.kind === 'tip') return t('earnings.tip');
    return m.title ? cleanTitle(m.title) : t('earnings.session');
  };

  return (
    <Screen bare>
      <View style={[styles.hero, { backgroundColor: theme.ink }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={[styles.round, { backgroundColor: theme.inkSurface2 }]}>
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={[styles.toggle, { backgroundColor: theme.inkSurface2 }]}>
            {(['month', 'year'] as Period[]).map((p) => (
              <Pressable key={p} accessibilityRole="button" onPress={() => setPeriod(p)} style={[styles.toggleItem, period === p && { backgroundColor: '#FFFFFF' }]}>
                <Text style={[styles.toggleText, { color: period === p ? theme.ink : '#FFFFFF' }]}>{p === 'month' ? monthName.charAt(0).toUpperCase() + monthName.slice(1) : t('earnings.year')}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={[styles.heroLabel, { color: theme.inkMuted }]}>{t('earnings.netIn', { period: periodName })}</Text>
        <Text style={[styles.heroBig, { color: theme.accent }]}>{euro0(data?.netCents ?? 0)}</Text>
        <View style={styles.statRow}>
          <View style={[styles.stat, { backgroundColor: theme.inkSurface2 }]}>
            <Text style={styles.statBig}>{data?.count ?? 0}</Text>
            <Text style={[styles.statSmall, { color: theme.inkMuted }]}>{t('earnings.payments')}</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: theme.inkSurface2 }]}>
            <Text style={styles.statBig}>{euro0(data?.feeCents ?? 0)}</Text>
            <Text style={[styles.statSmall, { color: theme.inkMuted }]}>{t('earnings.fees')}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}
        <Text style={[styles.section, { color: theme.text }]}>{t('earnings.latest')}</Text>
        <View style={[styles.list, { backgroundColor: theme.surface }]}>
          {data && data.movements.length > 0 ? (
            data.movements.map((m, i) => (
              <View key={m.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                <ProfileTap userId={m.payerId}><Avatar name={m.payerName} seed={m.payerId} size={40} round={20} path={m.payerAvatar} /></ProfileTap>
                <View style={styles.flex}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {m.payerName}
                  </Text>
                  <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={1}>
                    {what(m)} · {dayOf(m.at)}
                  </Text>
                </View>
                <View style={styles.amounts}>
                  <Text style={[styles.net, { color: m.netCents < 0 ? theme.danger : theme.text }]}>
                    {m.netCents < 0 ? '−' : '+'}
                    {money(m.netCents)}
                  </Text>
                  <Text style={[styles.sub, { color: theme.muted, fontSize: 11 }]}>{t('earnings.on', { gross: money(m.grossCents), fee: money(m.feeCents) })}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.empty, { color: theme.muted }]}>{t('earnings.empty')}</Text>
          )}
        </View>
        {openError ? <ErrorText>{t(openError)}</ErrorText> : null}
        <View style={styles.buttons}>
          <Pressable accessibilityRole="button" disabled={opening} onPress={() => void stripe()} style={[styles.btn, { backgroundColor: theme.surface }]}>
            <Text style={[styles.btnText, { color: theme.text }]}>{t('earnings.payouts')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={opening} onPress={() => void stripe()} style={[styles.btn, { backgroundColor: theme.ink }]}>
            <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{t('earnings.tax')}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { margin: 8, padding: 18, paddingTop: 24, borderRadius: 40, gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  toggleItem: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  toggleText: { fontFamily: fonts.semibold, fontSize: 13 },
  heroLabel: { fontFamily: fonts.regular, fontSize: 14 },
  heroBig: { fontFamily: fonts.semibold, fontSize: 64, letterSpacing: -3.8, lineHeight: 64 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12 },
  statBig: { fontFamily: fonts.semibold, fontSize: 20, color: '#FFFFFF' },
  statSmall: { fontFamily: fonts.regular, fontSize: 12 },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  section: { fontFamily: fonts.semibold, fontSize: 15, paddingHorizontal: 4 },
  list: { borderRadius: 30, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  name: { fontFamily: fonts.semibold, fontSize: 15 },
  sub: { fontFamily: fonts.regular, fontSize: 12 },
  amounts: { alignItems: 'flex-end' },
  net: { fontFamily: fonts.semibold, fontSize: 16 },
  empty: { fontFamily: fonts.regular, fontSize: 14, padding: 16, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 15 },
});
