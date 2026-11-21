// Codice a 6 cifre del check-in (disegno A4): foglio dal basso con sei caselle e la tastiera numerica del telefono.
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { checkIn } from '@/lib/checkin';
import { fonts, useTheme } from '@/theme';

type Props = { visible: boolean; bookingId: string; showerName: string; onClose: () => void; onCheckedIn: () => void };

export function CheckinCodeSheet({ visible, bookingId, showerName, onClose, onCheckedIn }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const input = useRef<TextInput>(null);
  const first = showerName.split(' ')[0];

  const close = () => {
    setCode('');
    setErrorKey(null);
    onClose();
  };

  const submit = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setErrorKey(null);
    const r = await checkIn(bookingId, { code });
    setBusy(false);
    if (r.checkedInAt) {
      setCode('');
      return onCheckedIn();
    }
    setErrorKey(r.errorKey);
    setCode('');
  };

  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? '');

  return (
    <SheetModal visible={visible} onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel={t('common.close')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.h, { color: theme.text }]}>{t('checkin.codeTitle')}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{t('checkin.codeSub', { name: first })}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={close} style={[styles.x, { backgroundColor: theme.bg }]}>
              <Ionicons name="close" size={20} color={theme.ink} />
            </Pressable>
          </View>
          {/* Il campo vero è invisibile sopra le caselle: tocca le caselle e si apre la tastiera numerica. */}
          <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.boxes}>
            {digits.map((d, i) => (
              <View key={i} style={[styles.box, { backgroundColor: i === code.length ? theme.surface : theme.bg, borderColor: i === code.length ? theme.ink : 'transparent' }, i === 3 && styles.gap]}>
                <Text style={[styles.digit, { color: theme.text }]}>{d}</Text>
              </View>
            ))}
            <TextInput
              ref={input}
              value={code}
              onChangeText={(v) => {
                setErrorKey(null);
                setCode(v.replace(/\D/g, '').slice(0, 6));
              }}
              onSubmitEditing={() => void submit()}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              accessibilityLabel={t('checkin.codeA11yField')}
              style={styles.hidden}
            />
          </Pressable>
          {errorKey ? (
            <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: theme.errorSoft }]}>
              <Ionicons name="warning-outline" size={18} color={theme.errorText} />
              <Text style={[styles.errorText, { color: theme.errorText }]}>{t(errorKey, { name: first })}</Text>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            haptic="light"
            accessibilityState={{ disabled: code.length !== 6 || busy, busy }}
            disabled={code.length !== 6 || busy}
            onPress={() => void submit()}
            style={[styles.go, { backgroundColor: theme.accent, opacity: code.length !== 6 ? 0.5 : 1 }]}>
            {busy ? <ActivityIndicator color={theme.onAccent} /> : <Text style={[styles.goText, { color: theme.onAccent }]}>{t('checkin.doCheckin')}</Text>}
          </Pressable>
          <Text style={[styles.foot, { color: theme.muted }]}>{t('checkin.codeFoot')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: { margin: 8, borderRadius: 40, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 22, gap: 18 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  h: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  x: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, height: 64, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gap: { marginLeft: 10 },
  digit: { fontFamily: fonts.semibold, fontSize: 30 },
  hidden: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.011, color: 'transparent' },
  error: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14 },
  errorText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  foot: { fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  go: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  goText: { fontFamily: fonts.semibold, fontSize: 16 },
});
