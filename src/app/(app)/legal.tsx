import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Group, GroupRow, Section, SettingsPage } from '@/components/settings';
import { COMPANY, LEGAL_VERSION, legalDocs } from '@/content/legal';
import { useLegalLang } from '@/lib/legal-text';
import { fonts, useTheme } from '@/theme';

export default function LegalHub() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useLegalLang();
  const icons = { terms: 'document-text-outline', privacy: 'lock-closed-outline', community: 'people-outline', seller: 'storefront-outline', info: 'information-circle-outline' } as const;
  return (
    <SettingsPage title={t('legal.hubTitle')} subtitle={t('legal.hubSub')}>
      <Section label={t('legal.choices')}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy-consents')} style={[styles.feature, { backgroundColor: theme.ink }]}>
          <Ionicons name="shield-checkmark-outline" size={24} color={theme.accent} />
          <View style={styles.flex}>
            <Text style={[styles.featureTitle, { color: '#FFFFFF' }]}>{t('consents.title')}</Text>
            <Text style={[styles.featureSub, { color: theme.inkMuted }]}>{t('legal.choicesSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.inkMuted} />
        </Pressable>
      </Section>
      <Section label={t('legal.documents')}>
        <Group>
          {legalDocs.map((d) => (
            <GroupRow key={d.key} icon={icons[d.key]} label={d.title[lang]} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: d.key } })} />
          ))}
        </Group>
      </Section>
      <Text style={[styles.foot, { color: theme.muted }]}>{`Timeet · ${COMPANY.name} · ${t('legal.version', { v: LEGAL_VERSION })}`}</Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 16 },
  featureTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  featureSub: { fontFamily: fonts.medium, fontSize: 13, marginTop: 2 },
  foot: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
});
