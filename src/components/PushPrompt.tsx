// Schermata che precede la richiesta di sistema per le notifiche (disegno A, 25 novembre): foglio dal basso con «Attiva» e «Non ora».
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { closePushPrompt, enablePush, usePushPromptRole } from '@/lib/push';
import { fonts, useTheme } from '@/theme';

export function PushPromptHost() {
  const { t } = useTranslation();
  const theme = useTheme();
  const role = usePushPromptRole();
  const [busy, setBusy] = useState(false);
  // durante la chiusura il testo resta quello di prima
  const [shown, setShown] = useState<'client' | 'seller'>('client');
  if (role && role !== shown) setShown(role);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    await enablePush();
    setBusy(false);
    await closePushPrompt(false);
  };

  return (
    <SheetModal visible={role !== null} onRequestClose={() => void closePushPrompt(true)}>
      <Pressable style={styles.scrim} onPress={() => void closePushPrompt(true)} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
        <View style={[styles.grab, { backgroundColor: theme.fill }]} />
        <View style={[styles.icon, { backgroundColor: theme.accent }]}>
          <Ionicons name="notifications-outline" size={28} color={theme.onAccent} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[styles.h, { color: theme.text }]}>{t('push.promptTitle')}</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>{t(`push.prompt_${shown}`)}</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void accept()} style={[styles.primary, { backgroundColor: theme.primary }]}>
          <Text style={[styles.primaryText, { color: theme.onPrimary }]}>{t('push.enable')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void closePushPrompt(true)} style={styles.later}>
          <Text style={[styles.laterText, { color: theme.muted }]}>{t('push.notNow')}</Text>
        </Pressable>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: { margin: 8, borderRadius: 40, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  h: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  primary: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 16 },
  later: { height: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 15 },
});
