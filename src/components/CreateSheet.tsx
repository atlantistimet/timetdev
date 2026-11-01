import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fonts, radius, useTheme } from '@/theme';

/** Finestra dal basso del "+": scelta tra Nuovo post, Nuova offerta, Nuovo slot personalizzato. */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const go = (path: '/new-post' | '/offer-edit' | '/slot-link-edit') => {
    onClose();
    router.push(path);
  };
  const rows = [
    { key: 'post', path: '/new-post' as const },
    { key: 'offer', path: '/offer-edit' as const },
    { key: 'slot', path: '/slot-link-edit' as const },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('common.close')} style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.handle, { backgroundColor: theme.fill }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t('create.title')}</Text>
          {rows.map((r) => (
            <Pressable
              key={r.key}
              accessibilityRole="button"
              onPress={() => go(r.path)}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.bg }, pressed && { opacity: 0.8 }]}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{t(`create.${r.key}`)}</Text>
              <Text style={[styles.rowHint, { color: theme.muted }]}>{t(`create.${r.key}Hint`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 20, paddingBottom: 36 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: 16 },
  title: { fontSize: 22, fontFamily: fonts.semibold, letterSpacing: -0.45, marginBottom: 14 },
  row: { borderRadius: radius.card, padding: 18, marginBottom: 8 },
  rowTitle: { fontSize: 18, fontFamily: fonts.semibold, letterSpacing: -0.3, marginBottom: 2 },
  rowHint: { fontSize: 14, lineHeight: 19, fontFamily: fonts.medium },
});
