import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';

/** Pallino + "Disponibile ora": si mostra ovunque compaia un venditore che ha acceso "Disponibile ora". */
export function NowBadge() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.accentSoft }]} accessibilityLabel={t('explore.availableNow')}>
      <View style={[styles.dot, { backgroundColor: theme.accent }]} />
      <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '800' }}>{t('explore.availableNow')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
