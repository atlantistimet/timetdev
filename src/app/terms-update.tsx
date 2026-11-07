import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Body, Button, ErrorText, Screen, Spacer, Title } from '@/components/ui';
import { LEGAL_EFFECTIVE, LEGAL_VERSION } from '@/content/legal';
import { useAuth } from '@/lib/auth';
import { useLegalLang } from '@/lib/legal-text';
import { fonts, useTheme } from '@/theme';

/** Compare quando i termini cambiano (o a chi non li ha mai accettati): niente app finché non si accetta o si lascia. */
export default function TermsUpdate() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useLegalLang();
  const { acceptTerms, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setErrorKey(await acceptTerms());
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{t('terms.updateTitle')}</Title>
      <Body muted>{t('terms.updateBody', { v: LEGAL_VERSION, date: LEGAL_EFFECTIVE[lang] })}</Body>
      <Spacer size={12} />
      {(['terms', 'community', 'privacy'] as const).map((d) => (
        <Pressable key={d} accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: d } })} style={[styles.row, { backgroundColor: theme.surface }]}>
          <Text style={[styles.rowText, { color: theme.text }]}>{t(`terms.read_${d}`)}</Text>
        </Pressable>
      ))}
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('terms.accept')} onPress={accept} loading={busy} />
      <View style={styles.gap} />
      <Button title={t('terms.leave')} variant="ghost" onPress={() => void signOut()} />
      <Text style={[styles.note, { color: theme.muted }]}>{t('terms.leaveNote')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 22, padding: 16 },
  rowText: { fontFamily: fonts.semibold, fontSize: 16 },
  gap: { height: 10 },
  note: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', marginTop: 6 },
});
