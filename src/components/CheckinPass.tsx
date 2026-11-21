// Pass del check-in a schermo intero (disegno B1): chi aspetta mostra il QR, il codice a 6 cifre e il tempo alla rotazione.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { getCheckinCredentials, type CheckinCredentials } from '@/lib/checkin';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

const RING = 2 * Math.PI * 25;

type Props = {
  visible: boolean;
  bookingId: string;
  /** Nome di chi arriva (chi scansiona). */
  arrivingName: string;
  title: string;
  placeLabel: string;
  startsAt: string;
  onClose: () => void;
  /** L'altra persona ha fatto il check-in: il pass si chiude da solo. */
  onCheckedIn: () => void;
};

export function CheckinPass({ visible, bookingId, arrivingName, title, placeLabel, startsAt, onClose, onCheckedIn }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [cred, setCred] = useState<CheckinCredentials | null>(null);
  const [left, setLeft] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const done = useRef(onCheckedIn);
  useEffect(() => {
    done.current = onCheckedIn;
  }, [onCheckedIn]);

  // Token: si chiede subito e poi a ogni rotazione (il server accetta anche quello della finestra precedente).
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const r = await getCheckinCredentials(bookingId);
      if (!alive) return;
      if (r.errorKey === 'checkin.errors.already_checked_in') return done.current();
      if (r.data) {
        setCred(r.data);
        setLeft(r.data.expires_in);
        setErrorKey(null);
        timer = setTimeout(load, Math.max(1, r.data.expires_in) * 1000);
      } else {
        setErrorKey(r.errorKey);
        timer = setTimeout(load, 10_000);
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [visible, bookingId]);

  // Secondi alla rotazione, e intanto si controlla se l'altra persona ha già scansionato.
  useEffect(() => {
    if (!visible) return;
    let ticks = 0;
    const id = setInterval(() => {
      setLeft((s) => Math.max(0, s - 1));
      ticks += 1;
      if (ticks % 4 === 0) {
        void supabase
          .from('bookings')
          .select('checked_in_at')
          .eq('id', bookingId)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.checked_in_at) done.current();
          });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [visible, bookingId]);

  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(startsAt));
  const code = cred ? `${cred.code.slice(0, 3)} ${cred.code.slice(3)}` : '··· ···';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.ink, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={[styles.round, { backgroundColor: theme.inkSurface }]}>
            <Ionicons name="close" size={22} color={theme.inkOn} />
          </Pressable>
          <View style={[styles.tag, { backgroundColor: theme.inkSurface }]}>
            <Text style={[styles.tagText, { color: theme.inkSoft }]}>{t('checkin.passTag', { time })}</Text>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[styles.h1, { color: theme.inkOn }]}>{t('checkin.showTitle', { name: arrivingName })}</Text>
          <Text style={[styles.sub, { color: theme.inkMuted }]}>{`${title} · ${placeLabel}`}</Text>
        </View>
        <View style={[styles.qrBox, { backgroundColor: '#FFFFFF' }]}>
          {cred ? (
            <QRCode value={cred.url} size={260} color={theme.ink} backgroundColor="#FFFFFF" ecl="M" />
          ) : (
            <View style={styles.qrWait}>{errorKey ? <Text style={[styles.err, { color: theme.errorText }]}>{t(errorKey)}</Text> : <ActivityIndicator color={theme.ink} />}</View>
          )}
        </View>
        <View style={[styles.codeBox, { backgroundColor: theme.inkSurface }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.codeLabel, { color: theme.inkMuted }]}>{t('checkin.codeLabel')}</Text>
            <Text accessibilityLabel={cred ? t('checkin.codeA11y', { code: cred.code.split('').join(' ') }) : undefined} style={[styles.code, { color: theme.accent }]}>
              {code}
            </Text>
          </View>
          <View style={styles.ring} accessibilityLabel={t('checkin.rotatesIn', { seconds: left })}>
            <Svg width={58} height={58} viewBox="0 0 58 58">
              <Circle cx={29} cy={29} r={25} fill="none" stroke={theme.inkSurface2} strokeWidth={6} />
              {left > 0 ? <Circle
                cx={29}
                cy={29}
                r={25}
                fill="none"
                stroke={theme.accent}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={`${(RING * Math.min(left, 60)) / 60} ${RING}`}
                transform="rotate(-90 29 29)"
              /> : null}
            </Svg>
            <Text style={[styles.ringText, { color: theme.inkOn }]}>{left}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={[styles.foot, { color: theme.inkMuted }]}>{t('checkin.passFoot')}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, gap: 18 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tag: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' },
  tagText: { fontFamily: fonts.semibold, fontSize: 13 },
  h1: { fontFamily: fonts.semibold, fontSize: 34, lineHeight: 36, letterSpacing: -1.4 },
  sub: { fontFamily: fonts.regular, fontSize: 15 },
  qrBox: { borderRadius: 40, padding: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  qrWait: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', padding: 16 },
  err: { fontFamily: fonts.medium, fontSize: 15, textAlign: 'center' },
  codeBox: { borderRadius: 32, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  codeLabel: { fontFamily: fonts.regular, fontSize: 13 },
  code: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 44, letterSpacing: 5, fontVariant: ['tabular-nums'] },
  ring: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute', fontFamily: fonts.semibold, fontSize: 15, fontVariant: ['tabular-nums'] },
  foot: { fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
});
