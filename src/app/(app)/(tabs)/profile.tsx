import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/ui';
import { createTicket } from '@/lib/safety';
import { useAuth } from '@/lib/auth';
import { loadMyProfile, loadMyStats, type MyProfile, type MyStats } from '@/lib/profile-edit';
import { useUnreadCount } from '@/lib/notifications';
import { shareText } from '@/lib/slot-links';
import { languageNames, supportedLanguages } from '@/i18n';
import { fonts, useTheme } from '@/theme';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { profile, session, signOut, setLanguage } = useAuth();
  const userId = session?.user.id ?? null;
  const unread = useUnreadCount(userId);
  const [mine, setMine] = useState<MyProfile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [now, setNow] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [section, setSection] = useState<'space' | 'settings'>('space');

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [p, s] = await Promise.all([loadMyProfile(userId), loadMyStats(userId)]);
      if (!alive) return;
      setMine(p);
      setStats(s);
      setNow(Date.now());
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const name = profile?.full_name ?? '';
  const first = name.split(' ')[0] || t('tabs.profile');
  const handle = mine?.handle ?? null;
  const available = !!mine?.available_until && new Date(mine.available_until).getTime() > now;
  const num = (n: number) => n.toLocaleString(i18n.language, { maximumFractionDigits: 1 });

  const share = async () => {
    if (!handle) return router.push('/profile-edit');
    const r = await shareText(`https://timeet.world/u/${handle}`);
    setNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null);
  };

  const requestExport = async () => {
    if (!userId) return;
    const failure = await createTicket({ me: userId, kind: 'other', reason: 'data_export', body: 'Richiesta copia dei dati personali (GDPR)' });
    setNote(failure ? t(failure) : t('safety.exportSent'));
  };

  type Row = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; badge?: boolean; danger?: boolean; onPress: () => void };
  const space: Row[] = [
    { key: 'seller', icon: 'storefront-outline', label: t('home.sellerArea'), onPress: () => router.push('/seller') },
    { key: 'services', icon: 'briefcase-outline', label: t('myServices.title'), value: stats ? String(stats.services) : undefined, onPress: () => router.push('/my-services') },
    { key: 'availability', icon: 'flash-outline', label: t('profile.availability'), value: available ? t('profile.availableNow') : t('profile.availableOff'), onPress: () => router.push('/availability') },
    { key: 'payments', icon: 'card-outline', label: t('profile.payments'), value: 'Stripe', onPress: () => router.push('/earnings') },
    { key: 'notifications', icon: 'notifications-outline', label: t('notifications.title'), badge: unread > 0, value: unread > 0 ? String(unread) : undefined, onPress: () => router.push('/notifications') },
  ];
  const settings: Row[] = [
    { key: 'language', icon: 'language-outline', label: t('settings.language'), value: languageNames[i18n.language] ?? i18n.language, onPress: () => setLangOpen(true) },
    { key: 'export', icon: 'download-outline', label: t('safety.exportRow'), onPress: () => void requestExport() },
    { key: 'blocked', icon: 'ban-outline', label: t('safety.blockedRow'), onPress: () => router.push('/blocked') },
    { key: 'support', icon: 'help-buoy-outline', label: t('safety.supportRow'), onPress: () => router.push('/support') },
    { key: 'signout', icon: 'log-out-outline', label: t('settings.signOut'), danger: true, onPress: () => void signOut() },
    { key: 'delete', icon: 'trash-outline', label: t('safety.deleteRow'), danger: true, onPress: () => router.push('/delete-account') },
  ];
  const rows = section === 'space' ? space : settings;

  return (
    <Screen tabs>
      <View style={styles.top}>
        <Avatar name={name || '?'} seed={userId ?? name} size={80} round={40} path={mine?.avatar_path} color={theme.ink} />
        <View style={styles.numbers}>
          <View style={styles.number}>
            <Text style={[styles.numBig, { color: theme.text }]}>{String(stats?.moments ?? 0)}</Text>
            <Text style={[styles.numSmall, { color: theme.muted }]}>{t('profile.moments')}</Text>
          </View>
          <View style={styles.number}>
            <Text style={[styles.numBig, { color: theme.text }]}>{String(stats?.services ?? 0)}</Text>
            <Text style={[styles.numSmall, { color: theme.muted }]}>{t('profile.servicesCount')}</Text>
          </View>
          <View style={styles.number}>
            <Text style={[styles.numBig, { color: theme.text }]}>{`${num(stats?.hours ?? 0)} h`}</Text>
            <Text style={[styles.numSmall, { color: theme.muted }]}>{t('profile.withPeople', { count: stats?.people ?? 0 })}</Text>
          </View>
        </View>
      </View>
      <View style={styles.who}>
        <Text style={[styles.name, { color: theme.text }]}>{name || first}</Text>
        <Text style={[styles.handle, { color: theme.muted }]}>{handle ? `timeet.world/u/${handle}` : t('publicProfile.needHandle')}</Text>
      </View>
      <View style={styles.btns}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={[styles.btn, { backgroundColor: theme.surface, flex: 1 }]}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('profile.edit')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void share()} style={[styles.btn, { backgroundColor: theme.surface, flex: 1 }]}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('profile.share')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('profile.preview')} onPress={() => (handle ? router.push({ pathname: '/u/[handle]', params: { handle } }) : router.push('/profile-edit'))} style={[styles.btn, { backgroundColor: theme.surface, width: 44 }]}>
          <Ionicons name="eye-outline" size={20} color={theme.text} />
        </Pressable>
      </View>
      {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}

      <View style={[styles.tabsRow, { borderBottomColor: theme.fill }]}>
        {(['space', 'settings'] as const).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: section === k }} onPress={() => setSection(k)} style={[styles.tabItem, section === k && { borderBottomColor: theme.ink }]}>
            <Text style={[styles.tabText, { color: section === k ? theme.text : theme.muted, fontFamily: section === k ? fonts.semibold : fonts.medium }]}>{t(k === 'space' ? 'profile.tabSpace' : 'profile.tabSettings')}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.list, { backgroundColor: theme.surface }]}>
        {rows.map((r, i) => (
          <Pressable key={r.key} accessibilityRole="button" onPress={r.onPress} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
            <View style={[styles.icon, { backgroundColor: theme.bg }]}>
              <Ionicons name={r.icon} size={20} color={r.danger ? theme.danger : theme.ink} />
              {r.badge ? <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.surface }]} /> : null}
            </View>
            <Text style={[styles.rowLabel, { color: r.danger ? theme.danger : theme.text }]}>{r.label}</Text>
            {r.value ? <Text style={[styles.rowValue, { color: theme.muted }]}>{r.value}</Text> : null}
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Pressable>
        ))}
      </View>

      <SheetModal visible={langOpen}  onRequestClose={() => setLangOpen(false)}>
        <Pressable style={[styles.backdrop]} onPress={() => setLangOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('settings.language')}</Text>
          {supportedLanguages.map((lang) => {
            const on = i18n.language === lang;
            return (
              <Pressable key={lang} accessibilityRole="button" onPress={() => { void setLanguage(lang); setLangOpen(false); }} style={[styles.langRow, { backgroundColor: on ? theme.ink : theme.surface }]}>
                <Text style={[styles.rowLabel, { color: on ? '#FFFFFF' : theme.text }]}>{languageNames[lang] ?? lang}</Text>
                {on ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
              </Pressable>
            );
          })}
        </View>
      </SheetModal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8, paddingHorizontal: 4 },
  numbers: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  number: { alignItems: 'center', flexShrink: 1 },
  numBig: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.6 },
  numSmall: { fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  who: { marginTop: 12, paddingHorizontal: 4, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.7 },
  handle: { fontFamily: fonts.medium, fontSize: 14 },
  btns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 15 },
  note: { fontFamily: fonts.medium, fontSize: 13, marginTop: 8, paddingHorizontal: 4 },
  tabsRow: { flexDirection: 'row', gap: 22, marginTop: 18, marginHorizontal: 4, borderBottomWidth: 1 },
  tabItem: { paddingBottom: 9, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 15 },
  list: { borderRadius: 26, padding: 6, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  rowLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 15 },
  rowValue: { fontFamily: fonts.regular, fontSize: 14 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 34, gap: 10 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.5 },
  langRow: { flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 999, paddingHorizontal: 20 },
});
