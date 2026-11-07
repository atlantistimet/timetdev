import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Body, ErrorText, Screen, Spacer, Title } from '@/components/ui';
import { getLegalDoc, LEGAL_EFFECTIVE, LEGAL_VERSION } from '@/content/legal';
import { useAuth } from '@/lib/auth';
import { useLegalLang } from '@/lib/legal-text';
import { fonts, useTheme } from '@/theme';

const docs = ['terms', 'community', 'privacy'] as const;

/** Compare quando i termini cambiano (o a chi non li ha mai accettati): si leggono i riassunti, si spunta e si entra. */
export default function TermsUpdate() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useLegalLang();
  const { acceptTerms, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setErrorKey(await acceptTerms());
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{t('terms.updateTitle')}</Title>
      <Body muted>{t('terms.updateBody', { v: LEGAL_VERSION, date: LEGAL_EFFECTIVE[lang] })}</Body>
      <Spacer size={8} />
      {docs.map((d) => {
        const doc = getLegalDoc(d);
        if (!doc) return null;
        return (
          <View key={d} style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{doc.title[lang]}</Text>
            <Text style={[styles.cardText, { color: theme.muted }]}>{doc.summary[lang]}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: d } })}>
              <Text style={[styles.read, { color: theme.text }]}>{t('terms.readFull')}</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => setChecked(!checked)}
        style={[styles.check, { backgroundColor: theme.ink }]}>
        <View style={[styles.tick, { backgroundColor: checked ? theme.accent : 'transparent', borderColor: checked ? theme.accent : 'rgba(255,255,255,0.6)' }]}>
          {checked ? <Ionicons name="checkmark" size={16} color={theme.onAccent} /> : null}
        </View>
        <Text style={styles.checkText}>{t('terms.checkLabel')}</Text>
      </Pressable>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !checked || busy }}
        onPress={accept}
        style={[styles.accept, { backgroundColor: theme.accent, opacity: checked ? 1 : 0.35 }]}>
        <Text style={[styles.acceptText, { color: theme.onAccent }]}>{busy ? t('common.loading') : t('terms.accept')}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.leave}>
        <Text style={[styles.leaveText, { color: theme.muted }]}>{t('terms.leave')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 16, gap: 6 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  cardText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  read: { fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline', marginTop: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 24, padding: 16, marginTop: 4 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  accept: { borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  acceptText: { fontFamily: fonts.semibold, fontSize: 17 },
  leave: { paddingVertical: 12, alignItems: 'center' },
  leaveText: { fontFamily: fonts.semibold, fontSize: 15 },
});
