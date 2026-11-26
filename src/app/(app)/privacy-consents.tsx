import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { ErrorText, LoadingView } from '@/components/ui';
import { Group, Section, SettingsPage } from '@/components/settings';
import { useAuth } from '@/lib/auth';
import { createTicket } from '@/lib/safety';
import { loadConsents, setConsent, type ConsentKey, type ConsentPrefs } from '@/lib/consents';
import { fonts, useTheme } from '@/theme';

type Item = { key: ConsentKey; title: string; text: string };
const comms: Item[] = [
  { key: 'marketing_email', title: 'consents.emailTitle', text: 'consents.emailText' },
  { key: 'marketing_push', title: 'consents.pushTitle', text: 'consents.pushText' },
];
const data: Item[] = [
  { key: 'personalization', title: 'consents.personalTitle', text: 'consents.personalText' },
  { key: 'analytics', title: 'consents.analyticsTitle', text: 'consents.analyticsText' },
];

export default function PrivacyConsents() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [prefs, setPrefs] = useState<ConsentPrefs | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let active = true;
    void loadConsents(me).then((p) => active && setPrefs(p));
    return () => {
      active = false;
    };
  }, [me]);

  if (!prefs) return <LoadingView />;

  const toggle = async (key: ConsentKey, value: boolean) => {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    const failure = await setConsent(key, value);
    setErrorKey(failure);
    if (failure) setPrefs(before);
  };

  const group = (items: Item[]) => (
    <Group>
      {items.map((it) => (
        <View key={it.key} style={styles.row}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{t(it.title)}</Text>
            <Text style={[styles.rowText, { color: theme.muted }]}>{t(it.text)}</Text>
          </View>
          <Switch
            accessibilityLabel={t(it.title)}
            value={prefs[it.key]}
            onValueChange={(v) => void toggle(it.key, v)}
            trackColor={{ true: theme.ink, false: theme.fill }}
            thumbColor={prefs[it.key] ? theme.accent : '#FFFFFF'}
          />
        </View>
      ))}
    </Group>
  );

  return (
    <SettingsPage title={t('consents.title')} subtitle={t('consents.intro')}>
      <Section label={t('consents.sectionComms')} note={t('consents.serviceNote')}>
        {group(comms)}
      </Section>
      <Section label={t('consents.sectionData')}>{group(data)}</Section>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Section>
        <Pressable accessibilityRole="button" onPress={async () => {
            if (!me) return;
            const failure = await createTicket({ me, kind: 'other', reason: 'data_export', body: 'Richiesta copia dei dati personali (GDPR)' });
            setNote(failure ? t(failure) : t('safety.exportSent'));
          }} style={[styles.action, { backgroundColor: theme.surface }]}>
          <Text style={[styles.actionText, { color: theme.text }]}>{t('consents.download')}</Text>
        </Pressable>
        {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.push('/delete-account')} style={styles.delete}>
          <Text style={[styles.actionText, { color: theme.danger }]}>{t('consents.delete')}</Text>
        </Pressable>
      </Section>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  rowText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: 2 },
  note: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginLeft: 6 },
  action: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  actionText: { fontFamily: fonts.semibold, fontSize: 15 },
  delete: { paddingVertical: 14, alignItems: 'center' },
});
