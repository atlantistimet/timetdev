import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Button, ErrorText, LoadingView, TextField } from '@/components/ui';
import { Group, GroupRow, Section, SettingsPage } from '@/components/settings';
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

  if (kind === null) {
    return (
      <SettingsPage title={t('safety.support.title')} subtitle={t('safety.support.eta')}>
        {sent ? <View style={[styles.note, { backgroundColor: theme.accent }]}><Text style={[styles.noteText, { color: theme.onAccent }]}>{t('safety.support.sent')}</Text></View> : null}
        <Section label={t('safety.support.newRequest')}>
          <Group>
            {KINDS.map((k) => (
              <GroupRow key={k.kind} icon={k.icon} label={t(`safety.support.kind_${k.kind}`)} onPress={() => { setKind(k.kind); setSent(false); }} />
            ))}
          </Group>
        </Section>
        <Section label={t('safety.support.mine')}>
          {tickets.length === 0 ? <Text style={[styles.meta, { color: theme.muted, marginLeft: 6 }]}>{t('safety.support.none')}</Text> : null}
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
        </Section>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title={t(`safety.support.kind_${kind}`)}>
      {kind === 'session' && params.refId ? (
        <Section label={t('safety.support.reasonTitle')}>
          {SESSION_REASONS.map((r) => (
            <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} onPress={() => setReason(r)} style={[styles.choice, { backgroundColor: theme.surface, borderColor: reason === r ? theme.ink : 'transparent' }]}>
              <Text style={[styles.rowText, { color: theme.text }]}>{t(`safety.support.reason_${r}`)}</Text>
            </Pressable>
          ))}
        </Section>
      ) : null}
      <Section>
        <TextField label={t('safety.support.tell')} value={body} onChangeText={setBody} multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: 'top' }} />
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      </Section>
      <Section>
        <Button title={t('safety.support.submit')} onPress={() => void send()} loading={busy} />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => setKind(null)} />
      </Section>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  rowText: { flex: 1, fontFamily: fonts.semibold, fontSize: 16 },
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
