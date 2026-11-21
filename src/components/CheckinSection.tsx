// Check-in nella pagina della sessione (sessioni in presenza, pagate).
//  - Chi aspetta: riquadro nero con "Mostra il QR", che apre il pass a schermo intero (B1).
//  - Chi arriva: riquadro lime con "Scansiona il QR" e "Inserisci il codice" (A2), che aprono scanner (A3) e codice (A4).
//  - Prima dell'apertura: una riga che dice quando compare.
//  - Assenza segnata in automatico: entro 24 ore il venditore corregge ("Il cliente c'era"), il cliente contesta.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { CheckinCodeSheet } from '@/components/CheckinCodeSheet';
import { CheckinPass } from '@/components/CheckinPass';
import { CheckinScanner } from '@/components/CheckinScanner';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { Button, ErrorText, TextField } from '@/components/ui';
import { checkinOpen, checkinRole, confirmAttended, disputeNoShow, minutesToCheckin, noShowLeftMs, type CheckinBooking } from '@/lib/checkin';
import { fonts, useTheme } from '@/theme';

type Person = { id: string; full_name: string; avatar_path: string | null };

type Props = {
  booking: CheckinBooking & { id: string; service_title: string; client_address: string | null };
  paid: boolean;
  me: string;
  nowMs: number;
  /** L'altra persona della sessione. */
  other: Person;
  placeLabel: string;
  onChanged: () => void;
};

export function CheckinSection({ booking: b, paid, me, nowMs, other, placeLabel, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [pass, setPass] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [codeSheet, setCodeSheet] = useState(false);
  const [dispute, setDispute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const role = checkinRole(b, me);
  if (!role || !paid) return null;
  const first = other.full_name.split(' ')[0];
  const open = checkinOpen(b, nowMs);
  const isSeller = me === b.seller_id;
  const noShowLeft = noShowLeftMs(b, nowMs);
  const before = b.status === 'confirmed' && !b.checked_in_at && !open && new Date(b.starts_at).getTime() > nowMs;
  const opensAt = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(new Date(b.starts_at).getTime() - 15 * 60_000));
  const hoursLeft = Math.max(1, Math.ceil(noShowLeft / 3_600_000));

  const done = () => {
    setPass(false);
    setScanner(false);
    setCodeSheet(false);
    onChanged();
  };

  const attended = async () => {
    setBusy(true);
    setErrorKey(null);
    const e = await confirmAttended(b.id);
    setBusy(false);
    if (e) setErrorKey(e);
    else onChanged();
  };

  return (
    <>
      {noShowLeft > 0 ? (
        <View style={[styles.card, { backgroundColor: theme.errorSoft }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: theme.surface }]}>
              <Ionicons name="person-remove-outline" size={20} color={theme.errorText} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: theme.errorText }]}>{t(isSeller ? 'checkin.noShowSellerTitle' : 'checkin.noShowClientTitle', { name: first })}</Text>
              <Text style={[styles.body, { color: theme.text }]}>{t(isSeller ? 'checkin.noShowSellerBody' : 'checkin.noShowClientBody', { count: hoursLeft })}</Text>
            </View>
          </View>
          {note ? <Text style={[styles.body, { color: theme.text }]}>{note}</Text> : null}
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          {isSeller ? (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void attended()} style={[styles.btn, { backgroundColor: theme.ink }]}>
              <Text style={[styles.btnText, { color: theme.inkOn }]}>{t('checkin.attended')}</Text>
            </Pressable>
          ) : note ? null : (
            <Pressable accessibilityRole="button" onPress={() => setDispute(true)} style={[styles.btn, { backgroundColor: theme.ink }]}>
              <Text style={[styles.btnText, { color: theme.inkOn }]}>{t('checkin.dispute')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {open && role === 'show' ? (
        <View style={[styles.card, { backgroundColor: theme.ink }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: theme.inkSurface }]}>
              <Ionicons name="qr-code-outline" size={22} color={theme.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: theme.inkOn }]}>{t('checkin.showTitle', { name: first })}</Text>
              <Text style={[styles.body, { color: theme.inkMuted }]}>{t('checkin.showSub')}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" haptic="light" onPress={() => setPass(true)} style={[styles.btn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.btnText, { color: theme.onAccent }]}>{t('checkin.showQr')}</Text>
          </Pressable>
        </View>
      ) : null}

      {open && role === 'scan' ? (
        <View style={[styles.card, { backgroundColor: theme.accent }]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: theme.ink }]}>
              <Ionicons name="location-outline" size={22} color={theme.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, { color: theme.onAccent }]}>{t(b.place === 'sede' ? 'checkin.arrivedTitle' : 'checkin.arrivedHomeTitle', { name: first })}</Text>
              <Text style={[styles.body, { color: theme.onAccent }]}>{b.place === 'domicilio' && b.client_address ? `${b.client_address} · ${t('checkin.doIt')}` : t('checkin.doIt')}</Text>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Pressable accessibilityRole="button" haptic="light" onPress={() => setScanner(true)} style={[styles.btnBig, { backgroundColor: theme.ink }]}>
              <Ionicons name="scan-outline" size={20} color={theme.inkOn} />
              <Text style={[styles.btnText, { color: theme.inkOn }]}>{t('checkin.scanQr')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setCodeSheet(true)} style={[styles.btnBig, { backgroundColor: theme.surface }]}>
              <Ionicons name="keypad-outline" size={20} color={theme.text} />
              <Text style={[styles.btnText, { color: theme.text }]}>{t('checkin.enterCode')}</Text>
            </Pressable>
          </View>
          <Text style={[styles.small, { color: theme.onAccent }]}>{t(isSeller ? 'checkin.arrivedFootSeller' : 'checkin.arrivedFootClient', { name: first })}</Text>
        </View>
      ) : null}

      {before ? (
        <View style={[styles.info, { backgroundColor: theme.surface }]}>
          <Ionicons name="qr-code-outline" size={18} color={theme.muted} />
          <Text style={[styles.body, { color: theme.muted, flex: 1 }]}>
            {t(role === 'show' ? 'checkin.beforeShow' : 'checkin.beforeScan', { time: opensAt, count: minutesToCheckin(b, nowMs) })}
          </Text>
        </View>
      ) : null}

      <CheckinPass
        visible={pass}
        bookingId={b.id}
        arrivingName={first}
        title={b.service_title}
        placeLabel={placeLabel}
        startsAt={b.starts_at}
        onClose={() => setPass(false)}
        onCheckedIn={done}
      />
      <CheckinScanner
        visible={scanner}
        bookingId={b.id}
        showerName={other.full_name}
        showerId={other.id}
        showerAvatar={other.avatar_path}
        title={b.service_title}
        subtitle={placeLabel}
        onClose={() => setScanner(false)}
        onUseCode={() => {
          setScanner(false);
          setCodeSheet(true);
        }}
        onCheckedIn={done}
      />
      <CheckinCodeSheet visible={codeSheet} bookingId={b.id} showerName={other.full_name} onClose={() => setCodeSheet(false)} onCheckedIn={done} />
      <DisputeSheet
        visible={dispute}
        bookingId={b.id}
        onClose={() => setDispute(false)}
        onSent={() => {
          setDispute(false);
          setNote(t('checkin.disputeSent'));
        }}
      />
    </>
  );
}

/** Il cliente contesta l'assenza: due righe per l'assistenza, poi la segnalazione. */
function DisputeSheet({ visible, bookingId, onClose, onSent }: { visible: boolean; bookingId: string; onClose: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setErrorKey(null);
    const e = await disputeNoShow(bookingId, text);
    setBusy(false);
    if (e) return setErrorKey(e);
    setText('');
    onSent();
  };
  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>{t('checkin.disputeTitle')}</Text>
        <Text style={[styles.body, { color: theme.muted }]}>{t('checkin.disputeSub')}</Text>
        <TextField label={t('checkin.disputeLabel')} value={text} onChangeText={setText} multiline maxLength={1000} />
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
        <Button title={t('checkin.disputeSend')} onPress={() => void send()} loading={busy} />
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 36, padding: 20, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.4 },
  body: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnBig: { height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
  info: { borderRadius: 28, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheet: { margin: 8, borderRadius: 40, padding: 20, gap: 12 },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 24, letterSpacing: -0.6 },
});
