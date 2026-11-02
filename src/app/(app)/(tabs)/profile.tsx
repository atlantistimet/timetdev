import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadMyProfile, loadMyStats, type MyProfile, type MyStats } from '@/lib/profile-edit';
import { useUnreadCount } from '@/lib/notifications';
import { shareText } from '@/lib/slot-links';
import { languageNames, supportedLanguages } from '@/i18n';
import { fonts, pastelFor, useTheme } from '@/theme';

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
    const r = await shareText(`https://timeet.world/${handle}`);
    setNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null);
  };

  const rows: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; badge?: boolean; onPress: () => void }[] = [
    { key: 'seller', icon: 'storefront-outline', label: t('home.sellerArea'), onPress: () => router.push('/seller') },
    { key: 'services', icon: 'briefcase-outline', label: t('myServices.title'), value: stats ? String(stats.services) : undefined, onPress: () => router.push('/my-services') },
    { key: 'sessions', icon: 'time-outline', label: t('sessions.title'), onPress: () => router.push('/sessions') },
    { key: 'availability', icon: 'flash-outline', label: t('profile.availability'), value: available ? t('profile.availableNow') : t('profile.availableOff'), onPress: () => router.push('/availability') },
    { key: 'payments', icon: 'card-outline', label: t('profile.payments'), value: 'Stripe', onPress: () => router.push('/earnings') },
    { key: 'notifications', icon: 'notifications-outline', label: t('notifications.title'), badge: unread > 0, value: unread > 0 ? String(unread) : undefined, onPress: () => router.push('/notifications') },
    { key: 'language', icon: 'language-outline', label: t('settings.language'), value: languageNames[i18n.language] ?? i18n.language, onPress: () => setLangOpen(true) },
    { key: 'signout', icon: 'log-out-outline', label: t('settings.signOut'), onPress: () => void signOut() },
  ];

  return (
    <Screen tabs bare>
      <View style={[styles.hero, { backgroundColor: pastelFor(userId ?? name) }]}>
        <View style={styles.heroTop}>
          <Avatar name={name || '?'} seed={userId ?? name} size={88} round={32} path={mine?.avatar_path} color={theme.ink} />
          <Pressable accessibilityRole="button" onPress={() => router.push('/profile-edit')} style={styles.edit}>
            <Text style={[styles.editText, { color: theme.ink }]}>{t('profile.edit')}</Text>
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[styles.name, { color: theme.ink }]}>{first}</Text>
          <Text style={[styles.handle, { color: theme.ink }]}>{handle ? `timeet.world/${handle}` : t('publicProfile.needHandle')}</Text>
        </View>
        <View style={styles.heroBtns}>
          <Pressable accessibilityRole="button" onPress={() => (handle ? router.push({ pathname: '/u/[handle]', params: { handle } }) : router.push('/profile-edit'))} style={[styles.heroBtn, { backgroundColor: theme.ink }]}>
            <Text style={[styles.heroBtnText, { color: '#FFFFFF' }]}>{t('profile.preview')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void share()} style={[styles.heroBtn, { backgroundColor: '#FFFFFF' }]}>
            <Text style={[styles.heroBtnText, { color: theme.ink }]}>{t('profile.share')}</Text>
          </Pressable>
        </View>
        {note ? <Text style={[styles.note, { color: theme.ink }]}>{note}</Text> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.tiles}>
          <View style={[styles.tile, { backgroundColor: theme.accent }]}>
            <Emoji name="heart_hands" size={30} />
            <View>
              <Text style={[styles.tileBig, { color: theme.onAccent }]}>{`${num(stats?.hours ?? 0)} h`}</Text>
              <Text style={[styles.tileSmall, { color: theme.onAccent }]}>{t('profile.withPeople', { count: stats?.people ?? 0 })}</Text>
            </View>
          </View>
          <View style={[styles.tile, { backgroundColor: theme.surface }]}>
            <Emoji name="star" size={30} />
            <View>
              <Text style={[styles.tileBig, { color: theme.text }]}>{String(stats?.moments ?? 0)}</Text>
              <Text style={[styles.tileSmall, { color: theme.muted }]}>{t('profile.moments')}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.list, { backgroundColor: theme.surface }]}>
          {rows.map((r, i) => (
            <Pressable key={r.key} accessibilityRole="button" onPress={r.onPress} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
              <View style={[styles.icon, { backgroundColor: theme.bg }]}>
                <Ionicons name={r.icon} size={20} color={theme.ink} />
                {r.badge ? <View style={[styles.dot, { backgroundColor: theme.accent, borderColor: theme.surface }]} /> : null}
              </View>
              <Text style={[styles.rowLabel, { color: theme.text }]}>{r.label}</Text>
              {r.value ? <Text style={[styles.rowValue, { color: theme.muted }]}>{r.value}</Text> : null}
              <Ionicons name="chevron-forward" size={18} color={theme.muted} />
            </Pressable>
          ))}
        </View>
      </View>

      <Modal visible={langOpen} transparent animationType="slide" onRequestClose={() => setLangOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.scrim }]} onPress={() => setLangOpen(false)} />
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
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { margin: 8, padding: 18, paddingTop: 56, borderRadius: 40, gap: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  edit: { height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.65)', justifyContent: 'center' },
  editText: { fontFamily: fonts.semibold, fontSize: 15 },
  name: { fontFamily: fonts.semibold, fontSize: 38, letterSpacing: -1.7, lineHeight: 40 },
  handle: { fontFamily: fonts.medium, fontSize: 15 },
  heroBtns: { flexDirection: 'row', gap: 8 },
  heroBtn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  heroBtnText: { fontFamily: fonts.semibold, fontSize: 15 },
  note: { fontFamily: fonts.medium, fontSize: 13 },
  body: { paddingHorizontal: 16, paddingTop: 2, gap: 10 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileBig: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: -1 },
  tileSmall: { fontFamily: fonts.regular, fontSize: 12 },
  list: { borderRadius: 30, padding: 6 },
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
