import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Screen, Title } from '@/components/ui';
import { Group, Section, SettingsPage } from '@/components/settings';
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
    <SettingsPage title={legal.title[lang]} subtitle={`${t('legal.version', { v: LEGAL_VERSION })} · ${t('legal.effective', { date: LEGAL_EFFECTIVE[lang] })}`}>
      <View style={[styles.brief, { backgroundColor: theme.ink }]}>
        <Text style={[styles.briefLabel, { color: theme.accent }]}>{t('legal.inShort')}</Text>
        <Text style={styles.briefText}>{legal.summary[lang]}</Text>
      </View>
      <Section label={t('legal.sections')}>
        <Group>
          {legal.sections.map((s, i) => {
            const isOpen = open === i;
            return (
              <View key={i}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : i)} style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>{s.title[lang]}</Text>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
                </Pressable>
                {isOpen ? <Text style={[styles.sectionBody, { color: theme.text }]}>{s.body[lang]}</Text> : null}
              </View>
            );
          })}
        </Group>
      </Section>
      <View style={styles.foot}>
        {session && legal.key !== 'info' ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/support', params: { kind: 'other' } })}>
            <Text style={[styles.report, { color: theme.muted }]}>{t('legal.report')}</Text>
          </Pressable>
        ) : null}
        <Text style={[styles.draft, { color: theme.muted }]}>{t('legal.draftNote')}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  brief: { borderRadius: 22, padding: 18, gap: 6 },
  briefLabel: { fontFamily: fonts.semibold, fontSize: 13 },
  briefText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, color: '#FFFFFF' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 8 },
  sectionTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  sectionBody: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, paddingBottom: 14 },
  foot: { gap: 12, alignItems: 'center' },
  report: { fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: 'underline', textAlign: 'center' },
  draft: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
});
