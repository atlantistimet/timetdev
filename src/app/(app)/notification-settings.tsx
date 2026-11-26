// Impostazioni delle notifiche (disegno A, 26 novembre, con «Inviti e offerte» e «Prova» come nel B): pannello lime con l'interruttore del telefono,
// cosa si riceve, promozioni, notifica di prova e l'avviso se il telefono le ha negate.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { ErrorText, LoadingView } from '@/components/ui';
import { Section, SettingsPage } from '@/components/settings';
import { useAuth } from '@/lib/auth';
import { loadConsents, setConsent, type ConsentPrefs } from '@/lib/consents';
import { disablePush, getPushStatus, PUSH_SUPPORTED, sendTestPush, turnOnPush } from '@/lib/push';
import { fonts, useTheme } from '@/theme';

type Status = Awaited<ReturnType<typeof getPushStatus>>;

const RECEIVE: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'calendar-outline', label: 'push.rcvBookings' },
  { icon: 'chatbubble-outline', label: 'push.rcvMessages' },
  { icon: 'card-outline', label: 'push.rcvPayments' },
  { icon: 'call-outline', label: 'push.rcvCalls' },
];

export default function NotificationSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [status, setStatus] = useState<Status | null>(null);
  const [prefs, setPrefs] = useState<ConsentPrefs | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testKey, setTestKey] = useState<string | null>(null);

  const reload = useCallback(() => void getPushStatus().then(setStatus), []);
  // il permesso può cambiare dalle Impostazioni del telefono: si rilegge quando la schermata o l'app tornano in primo piano
  useFocusEffect(reload);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => sub.remove();
  }, [reload]);

  useEffect(() => {
    if (!me) return;
    let active = true;
    void loadConsents(me).then((p) => active && setPrefs(p));
    return () => {
      active = false;
    };
  }, [me]);

  if (!status || !prefs) return <LoadingView />;

  const togglePhone = async (value: boolean) => {
    setTestKey(null);
    if (!value) {
      setStatus({ ...status, on: false });
      await disablePush();
      return;
    }
    const r = await turnOnPush();
    if (r === 'denied') void Linking.openSettings();
    reload();
  };

  const togglePromo = async (value: boolean) => {
    const before = prefs;
    setPrefs({ ...prefs, marketing_push: value });
    const failure = await setConsent('marketing_push', value);
    setErrorKey(failure);
    if (failure) setPrefs(before);
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setTestKey(null);
    const r = await sendTestPush();
    setTesting(false);
    setTestKey(r === 'sent' ? 'push.testSent' : r === 'none' ? 'push.testNone' : 'push.testFailed');
  };

  const denied = status.state === 'denied';
  const on = status.on;

  return (
    <SettingsPage title={PUSH_SUPPORTED ? undefined : t('push.settingsTitle')} subtitle={PUSH_SUPPORTED ? undefined : t('push.webNote')}>
      {PUSH_SUPPORTED ? (
        <View style={[styles.hero, { backgroundColor: on ? theme.accent : theme.fill }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: on ? theme.ink : theme.surface }]}>
              <Ionicons name={on ? 'notifications' : 'notifications-off-outline'} size={26} color={on ? theme.accent : theme.muted} />
            </View>
            <Switch
              accessibilityLabel={t(on ? 'push.heroOn' : 'push.heroOff')}
              value={on}
              onValueChange={(v) => void togglePhone(v)}
              trackColor={{ true: theme.ink, false: theme.surface }}
              thumbColor={on ? theme.accent : '#FFFFFF'}
            />
          </View>
          <Text accessibilityRole="header" style={[styles.heroTitle, { color: theme.text }]}>{t(on ? 'push.heroOn' : 'push.heroOff')}</Text>
          <Text style={[styles.heroText, { color: on ? theme.onAccent : theme.muted }]}>{t(on ? 'push.heroOnText' : 'push.heroOffText')}</Text>
        </View>
      ) : null}

      {PUSH_SUPPORTED && denied ? (
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.line}>
            <Ionicons name="notifications-off-outline" size={22} color={theme.danger} />
            <Text style={[styles.title, styles.flex, { color: theme.text }]}>{t('push.deniedTitle')}</Text>
          </View>
          <Text style={[styles.text, { color: theme.muted }]}>{t('push.deniedText')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={[styles.action, { backgroundColor: theme.primary }]}>
            <Text style={[styles.actionText, { color: theme.onPrimary }]}>{t('push.openSettings')}</Text>
          </Pressable>
        </View>
      ) : null}

      {PUSH_SUPPORTED ? (
        <Section label={t('push.receiveTitle')}>
          <View style={[styles.list, { backgroundColor: theme.surface, opacity: on ? 1 : 0.55 }]}>
            {RECEIVE.map((r, i) => (
              <View key={r.label} style={[styles.rcv, i > 0 && { borderTopWidth: 1, borderTopColor: theme.line }]}>
                <View style={[styles.chip, { backgroundColor: theme.bg }]}>
                  <Ionicons name={r.icon} size={18} color={theme.text} />
                </View>
                <Text style={[styles.rcvLabel, { color: theme.text }]}>{t(r.label)}</Text>
                <Ionicons name={on ? 'checkmark' : 'remove'} size={18} color={on ? theme.success : theme.muted} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <Section label={t('push.promoSection')}>
        <View style={[styles.card, styles.line, { backgroundColor: theme.surface }]}>
          <View style={[styles.chip, styles.chipBig, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="gift-outline" size={22} color={theme.text} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.title, { color: theme.text }]}>{t('push.promoTitle')}</Text>
            <Text style={[styles.text, { color: theme.muted }]}>{t('push.promoText')}</Text>
          </View>
          <Switch
            accessibilityLabel={t('push.promoTitle')}
            value={prefs.marketing_push}
            onValueChange={(v) => void togglePromo(v)}
            trackColor={{ true: theme.ink, false: theme.fill }}
            thumbColor={prefs.marketing_push ? theme.accent : '#FFFFFF'}
          />
        </View>
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      </Section>

      {PUSH_SUPPORTED && on ? (
        <Section label={t('push.testSection')}>
          <Pressable accessibilityRole="button" onPress={() => void test()} style={[styles.card, styles.line, { backgroundColor: theme.surface }]}>
            <View style={[styles.chip, styles.chipBig, { backgroundColor: theme.bg }]}>
              <Ionicons name="paper-plane-outline" size={20} color={theme.text} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: theme.text }]}>{t('push.testTitle')}</Text>
              <Text style={[styles.text, { color: theme.muted }]}>{t('push.testText')}</Text>
            </View>
            {testing ? <ActivityIndicator color={theme.text} /> : <Ionicons name="chevron-forward" size={18} color={theme.muted} />}
          </Pressable>
          {testKey ? <Text style={[styles.note, { color: testKey === 'push.testSent' ? theme.success : theme.danger }]}>{t(testKey)}</Text> : null}
        </Section>
      ) : null}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: 28, padding: 18, gap: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.8 },
  heroText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 22, padding: 16, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  list: { borderRadius: 22, paddingHorizontal: 16 },
  rcv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rcvLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  chip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chipBig: { width: 40, height: 40, borderRadius: 13 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  text: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  note: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginLeft: 6 },
  action: { borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  actionText: { fontFamily: fonts.semibold, fontSize: 15 },
});
