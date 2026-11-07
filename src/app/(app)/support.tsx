import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createTicket, listTickets, type Ticket, type TicketKind } from '@/lib/safety';
import { fonts, radius, useTheme } from '@/theme';

const KINDS: { kind: TicketKind; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: 'payment', icon: 'card-outline' },
  { kind: 'session', icon: 'calendar-outline' },
  { kind: 'person', icon: 'person-outline' },
  { kind: 'bug', icon: 'bug-outline' },
];
const SESSION_REASONS = ['notHappened', 'unsatisfied', 'wrongCharge', 'behavior'] as const;

/** Assistenza: richieste aperte e nuova richiesta. Con ?kind=session&refId=<prenotazione> contesta una sessione. */
export default function SupportScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const params = useLocalSearchParams<{ kind?: string; refType?: string; refId?: string }>();
  const [kind, setKind] = useState<TicketKind | null>(KINDS.some((k) => k.kind === params.kind) ? (params.kind as TicketKind) : null);
  const [reason, setReason] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);

  const load = useCallback(async () => {
    if (me) setTickets(await listTickets(me));
  }, [me]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!tickets) return <LoadingView />;

  const send = async () => {
    if (!me || !kind) return;
    if (kind === 'session' && params.refId && !reason) return setErrorKey('safety.support.pickReason');
    setBusy(true);
    setErrorKey(null);
    const failure = await createTicket({ me, kind, reason, body, refType: params.refId ? ((params.refType as 'booking' | 'call') ?? 'booking') : null, refId: params.refId ?? null });
    setBusy(false);
    if (failure) return setErrorKey(failure);
    setSent(true);
    setKind(null);
    setBody('');
    setReason(null);
    void load();
  };

  const statusLabel = (s: Ticket['status']) => t(`safety.support.status_${s}`);

  return (
    <Screen back>
      <Title>{t('safety.support.title')}</Title>
      {sent ? <View style={[styles.note, { backgroundColor: theme.accent }]}><Text style={[styles.noteText, { color: theme.onAccent }]}>{t('safety.support.sent')}</Text></View> : null}
      {kind === null ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {KINDS.map((k, i) => (
              <Pressable key={k.kind} accessibilityRole="button" onPress={() => { setKind(k.kind); setSent(false); }} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }]}>
                <Ionicons name={k.icon} size={22} color={theme.text} />
                <Text style={[styles.rowText, { color: theme.text }]}>{t(`safety.support.kind_${k.kind}`)}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.muted} />
              </Pressable>
            ))}
          </View>
          <Text style={[styles.section, { color: theme.text }]}>{t('safety.support.mine')}</Text>
          {tickets.length === 0 ? <Body muted>{t('safety.support.none')}</Body> : null}
          {tickets.map((x) => (
            <View key={x.id} style={[styles.ticket, { backgroundColor: theme.surface }]}>
              <View style={styles.ticketHead}>
                <Text style={[styles.rowText, { color: theme.text }]}>{t(`safety.support.kind_${x.kind}`)}</Text>
                <View style={[styles.pill, { backgroundColor: x.status === 'open' ? theme.accent : theme.fill }]}><Text style={[styles.pillText, { color: x.status === 'open' ? theme.onAccent : theme.text }]}>{statusLabel(x.status)}</Text></View>
              </View>
              <Text style={[styles.meta, { color: theme.muted }]}>{new Date(x.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}{x.reason ? ` · ${t(`safety.support.reason_${x.reason}`, { defaultValue: x.reason })}` : ''}</Text>
              {x.body ? <Text style={[styles.meta, { color: theme.text }]}>{x.body}</Text> : null}
              {x.admin_reply ? <View style={[styles.reply, { backgroundColor: theme.bg }]}><Text style={[styles.meta, { color: theme.text }]}>{x.admin_reply}</Text></View> : null}
            </View>
          ))}
          <Body muted>{t('safety.support.eta')}</Body>
        </>
      ) : (
        <>
          <Text style={[styles.section, { color: theme.text }]}>{t(`safety.support.kind_${kind}`)}</Text>
          {kind === 'session' && params.refId ? (
            <View style={{ gap: 8 }}>
              {SESSION_REASONS.map((r) => (
                <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} onPress={() => setReason(r)} style={[styles.choice, { backgroundColor: theme.surface, borderColor: reason === r ? theme.ink : 'transparent' }]}>
                  <Text style={[styles.rowText, { color: theme.text }]}>{t(`safety.support.reason_${r}`)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextField label={t('safety.support.tell')} value={body} onChangeText={setBody} multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: 'top' }} />
          {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
          <Spacer size={4} />
          <Button title={t('safety.support.submit')} onPress={() => void send()} loading={busy} />
          <Button title={t('common.cancel')} variant="ghost" onPress={() => setKind(null)} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  rowText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
  section: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.4, marginTop: 8 },
  ticket: { borderRadius: radius.card, padding: 16, gap: 6 },
  ticketHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  meta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  reply: { borderRadius: 16, padding: 12 },
  note: { borderRadius: 16, padding: 14 },
  noteText: { fontFamily: fonts.semibold, fontSize: 15 },
  choice: { borderRadius: 20, padding: 16, borderWidth: 2 },
});
