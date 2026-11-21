// Scansione del QR del check-in (disegno A3): fotocamera a tutto schermo con la nostra cornice lime.
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Pressable } from '@/components/Pressable';
import { checkIn, parseCheckinLink } from '@/lib/checkin';
import { fonts, useTheme } from '@/theme';

type Props = {
  visible: boolean;
  bookingId: string;
  /** Chi mostra il QR. */
  showerName: string;
  showerId: string;
  showerAvatar: string | null;
  title: string;
  subtitle: string;
  onClose: () => void;
  onUseCode: () => void;
  onCheckedIn: () => void;
};

export function CheckinScanner(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose}>
      {/* La fotocamera esiste solo mentre il foglio è aperto: ne può essere attiva una sola alla volta. */}
      {props.visible ? <ScannerBody {...props} /> : null}
    </Modal>
  );
}

function ScannerBody({ bookingId, showerName, showerId, showerAvatar, title, subtitle, onClose, onUseCode, onCheckedIn }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const lastData = useRef<string | null>(null);
  const first = showerName.split(' ')[0];

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (busy || data === lastData.current) return;
    lastData.current = data;
    const link = parseCheckinLink(data);
    if (!link) return setErrorKey('checkin.errors.not_checkin_qr');
    if (link.bookingId !== bookingId) return setErrorKey('checkin.errors.other_booking');
    setBusy(true);
    setErrorKey(null);
    const r = await checkIn(bookingId, { token: link.token });
    setBusy(false);
    if (r.checkedInAt) return onCheckedIn();
    setErrorKey(r.errorKey);
    // lo stesso QR, rigenerato, si potrà leggere di nuovo
    setTimeout(() => {
      lastData.current = null;
    }, 2500);
  };

  const granted = !!permission?.granted;

  return (
    <View style={[styles.root, { backgroundColor: theme.ink }]}>
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : (r) => void onScan(r)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.inkSurface2 }]} />
      )}
      <View style={[styles.layer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.round}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>
          {granted ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t(torch ? 'checkin.torchOff' : 'checkin.torchOn')} accessibilityState={{ selected: torch }} onPress={() => setTorch((v) => !v)} style={[styles.round, torch && { backgroundColor: theme.accent }]}>
              <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color={torch ? theme.onAccent : '#FFFFFF'} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.head}>
          <Text style={styles.h1}>{t('checkin.scanTitle', { name: first })}</Text>
          <Text style={[styles.sub, { color: theme.inkSoft }]}>{t('checkin.scanSub')}</Text>
        </View>

        {granted ? (
          <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.corner, styles.tl, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.tr, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.bl, { borderColor: theme.accent }]} />
            <View style={[styles.corner, styles.br, { borderColor: theme.accent }]} />
            {busy ? <ActivityIndicator color={theme.accent} size="large" /> : <View style={[styles.line, { backgroundColor: theme.accent }]} />}
          </View>
        ) : (
          <View style={[styles.permBox, { backgroundColor: theme.inkSurface }]}>
            {permission === null ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <>
                <Text style={[styles.permText, { color: theme.inkOn }]}>{t('checkin.cameraNeeded')}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
                  style={[styles.permBtn, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.btnText, { color: theme.onAccent }]}>{t(permission.canAskAgain ? 'checkin.allowCamera' : 'checkin.openSettings')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />
        {errorKey ? (
          <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: theme.errorSoft }]}>
            <Text style={[styles.errorText, { color: theme.errorText }]}>{t(errorKey, { name: first })}</Text>
          </View>
        ) : null}
        <View style={[styles.card, { backgroundColor: theme.inkSurface }]}>
          <Avatar name={showerName} seed={showerId} path={showerAvatar} size={44} round={16} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.inkOn }]}>{title}</Text>
            <Text numberOfLines={1} style={[styles.cardSub, { color: theme.inkMuted }]}>{subtitle}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={onUseCode} style={[styles.codeBtn, { backgroundColor: theme.surface }]}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('checkin.useCode')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const C = 56;
const styles = StyleSheet.create({
  root: { flex: 1 },
  layer: { flex: 1, paddingHorizontal: 16, alignItems: 'center' },
  top: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(21,21,21,0.7)', alignItems: 'center', justifyContent: 'center' },
  head: { marginTop: 32, alignItems: 'center', gap: 4 },
  h1: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.8, color: '#FFFFFF', textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 15, textAlign: 'center' },
  frame: { marginTop: 40, width: 270, height: 270, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: C, height: C },
  tl: { left: 0, top: 0, borderLeftWidth: 6, borderTopWidth: 6, borderTopLeftRadius: 34 },
  tr: { right: 0, top: 0, borderRightWidth: 6, borderTopWidth: 6, borderTopRightRadius: 34 },
  bl: { left: 0, bottom: 0, borderLeftWidth: 6, borderBottomWidth: 6, borderBottomLeftRadius: 34 },
  br: { right: 0, bottom: 0, borderRightWidth: 6, borderBottomWidth: 6, borderBottomRightRadius: 34 },
  line: { width: 214, height: 3, borderRadius: 2 },
  permBox: { marginTop: 40, alignSelf: 'stretch', borderRadius: 32, padding: 20, gap: 14, alignItems: 'center' },
  permText: { fontFamily: fonts.medium, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  permBtn: { height: 52, paddingHorizontal: 22, borderRadius: 26, justifyContent: 'center' },
  error: { alignSelf: 'stretch', borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
  errorText: { fontFamily: fonts.medium, fontSize: 14 },
  card: { alignSelf: 'stretch', borderRadius: 32, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 15 },
  cardSub: { fontFamily: fonts.regular, fontSize: 13 },
  codeBtn: { marginTop: 10, alignSelf: 'stretch', height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
});
