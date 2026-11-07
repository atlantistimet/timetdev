import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Screen, Title } from '@/components/ui';
import { COMPANY, LEGAL_VERSION, legalDocs } from '@/content/legal';
import { useLegalLang } from '@/lib/legal-text';
import { fonts, useTheme } from '@/theme';

export default function LegalHub() {
  const { t } = useTranslation();
  const theme = useTheme();
  const lang = useLegalLang();
  const icons = { terms: 'document-text-outline', privacy: 'lock-closed-outline', community: 'people-outline', seller: 'storefront-outline', info: 'information-circle-outline' } as const;
  return (
    <Screen back>
      <Title>{t('legal.hubTitle')}</Title>
      <Pressable accessibilityRole="button" onPress={() => router.push('/privacy-consents')} style={[styles.row, { backgroundColor: theme.ink }]}>
        <Ionicons name="shield-checkmark-outline" size={22} color={theme.accent} />
        <Text style={[styles.label, { color: '#FFFFFF' }]}>{t('consents.title')}</Text>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
      </Pressable>
      <View style={styles.list}>
        {legalDocs.map((d) => (
          <Pressable key={d.key} accessibilityRole="button" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: d.key } })} style={[styles.row, { backgroundColor: theme.surface }]}>
            <Ionicons name={icons[d.key]} size={22} color={theme.ink} />
            <Text style={[styles.label, { color: theme.text }]}>{d.title[lang]}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.foot, { color: theme.muted }]}>{`Timeet · ${COMPANY.name} · ${t('legal.version', { v: LEGAL_VERSION })}`}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 16 },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  foot: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', marginTop: 12 },
});
