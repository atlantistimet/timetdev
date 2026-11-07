import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Body, Screen, Title } from '@/components/ui';
import { getLegalDoc, LEGAL_EFFECTIVE, LEGAL_VERSION } from '@/content/legal';
import { useAuth } from '@/lib/auth';
import { useLegalLang } from '@/lib/legal-text';
import { fonts, useTheme } from '@/theme';

export default function LegalReader() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useLegalLang();
  const { session } = useAuth();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const legal = getLegalDoc(String(doc));
  const [open, setOpen] = useState<number | null>(0);

  if (!legal) {
    return (
      <Screen back>
        <Title>{t('legal.notFound')}</Title>
      </Screen>
    );
  }
  return (
    <Screen back>
      <Title>{legal.title[lang]}</Title>
      <Text style={[styles.meta, { color: theme.muted }]}>
        {t('legal.version', { v: LEGAL_VERSION })} · {t('legal.effective', { date: LEGAL_EFFECTIVE[lang] })}
      </Text>
      <View style={[styles.brief, { backgroundColor: theme.ink }]}>
        <Text style={[styles.briefLabel, { color: theme.accent }]}>{t('legal.inShort')}</Text>
        <Text style={styles.briefText}>{legal.summary[lang]}</Text>
      </View>
      {legal.sections.map((s, i) => {
        const isOpen = open === i;
        return (
          <View key={i} style={[styles.section, { backgroundColor: theme.surface }]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : i)} style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{s.title[lang]}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
            </Pressable>
            {isOpen ? <Text style={[styles.sectionBody, { color: theme.text }]}>{s.body[lang]}</Text> : null}
          </View>
        );
      })}
      {session && legal.key !== 'info' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/support', params: { kind: 'other' } })}>
          <Text style={[styles.report, { color: theme.muted }]}>{t('legal.report')}</Text>
        </Pressable>
      ) : null}
      <Body muted>{t('legal.draftNote')}</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { fontFamily: fonts.medium, fontSize: 13 },
  brief: { borderRadius: 24, padding: 18, gap: 6, marginVertical: 8 },
  briefLabel: { fontFamily: fonts.semibold, fontSize: 13 },
  briefText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: '#FFFFFF' },
  section: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 8 },
  sectionTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  sectionBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, paddingBottom: 14 },
  report: { fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline', textAlign: 'center', marginTop: 8 },
});
