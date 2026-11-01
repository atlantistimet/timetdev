import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fonts, useTheme } from '@/theme';

/** Pillola lime "Disponibile ora": si mostra ovunque compaia un venditore che ha acceso "Disponibile ora". */
export function NowBadge() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: theme.accent }]} accessibilityLabel={t('explore.availableNow')}>
      <View style={[styles.dot, { backgroundColor: theme.onAccent }]} />
      <Text style={[styles.text, { color: theme.onAccent }]}>{t('explore.availableNow')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontFamily: fonts.semibold },
});
