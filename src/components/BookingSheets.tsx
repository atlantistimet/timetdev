import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { formatEuro, markBookingOutcome } from '@/lib/booking';
import { byHoursDesc, cancelBooking, loadDefaultTiers, previewCancel, type CancelPreview, type Tier } from '@/lib/cancel-policy';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

type Who = { id: string; title: string; startsAt: string; otherName: string; otherAvatar: string | null; otherSeed: string };

function SheetShell({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SheetModal  visible={visible} onRequestClose={onClose}>
      <View style={[styles.scrim]}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grabber, { backgroundColor: theme.fill }]} />
          {children}
        </View>
      </View>
    </SheetModal>
  );
}

function Head({ who, sub }: { who: Who; sub: string }) {
  const theme = useTheme();
  return (
    <View style={styles.head}>
      <Avatar name={who.otherName} seed={who.otherSeed} size={52} round={18} path={who.otherAvatar} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.headTitle, { color: theme.text }]}>{who.title}</Text>
        <Text numberOfLines={2} style={[styles.headSub, { color: theme.muted }]}>{sub}</Text>
      </View>
    </View>
  );
}

/** "Vuoi annullare?": rimborso reale calcolato dal server e fasce del servizio. */
export function CancelSheet({ who, serviceId, sellerId, paidCents, onClose, onCancelled }: { who: Who; serviceId: string | null; sellerId: string; paidCents: number; onClose: () => void; onCancelled: (r: CancelPreview) => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setNowMs(Date.now());
      const [p, own] = await Promise.all([
        previewCancel(who.id),
        serviceId ? supabase.from('services').select('cancel_tiers').eq('id', serviceId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const ownTiers = (own.data as { cancel_tiers: Tier[] | null } | null)?.cancel_tiers ?? null;
      const list = ownTiers ?? (await loadDefaultTiers(sellerId));
      if (!alive) return;
      if (p.data) setPreview(p.data);
      else setErrorKey(p.errorKey);
      setTiers(byHoursDesc(list));
    })();
    return () => {
      alive = false;
    };
  }, [who.id, serviceId, sellerId]);

  const hoursLeft = (new Date(who.startsAt).getTime() - nowMs) / 3_600_000;
  const current = tiers.find((x) => hoursLeft >= x.hours_before) ?? tiers[tiers.length - 1];
  const fmtDate = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(who.startsAt));
  const label = (x: Tier, i: number) => (x.hours_before === 0 && i === tiers.length - 1 ? t('bookings.tierAfter') : t('bookings.tierUpTo', { hours: x.hours_before }));

  const confirm = async () => {
    setBusy(true);
    const r = await cancelBooking(who.id);
    setBusy(false);
    if (r.data) onCancelled(r.data);
    else setErrorKey(r.errorKey);
  };

  return (
    <SheetShell visible onClose={onClose}>
      <Head who={who} sub={`${who.otherName.split(' ')[0]} · ${fmtDate}${paidCents > 0 ? ` · ${t('bookings.paidShort', { amount: formatEuro(paidCents, i18n.language) })}` : ''}`} />
      <Text style={[styles.h2, { color: theme.text }]}>{t('bookings.cancelTitle')}</Text>
      <View style={[styles.refund, { backgroundColor: theme.accent }]}>
        <Text style={[styles.refundSmall, { color: theme.onAccent }]}>{t('bookings.refundYou')}</Text>
        <Text style={[styles.refundBig, { color: theme.onAccent }]}>{preview ? formatEuro(preview.paid ? preview.refund_cents : 0, i18n.language) : '…'}</Text>
        <Text style={[styles.refundSmall, { color: theme.onAccent, fontFamily: fonts.medium }]}>
          {preview ? (preview.paid ? t('bookings.refundRule', { pct: preview.refund_pct }) : t('bookings.noPayment')) : ' '}
        </Text>
      </View>
      <View style={{ gap: 6 }}>
        {tiers.map((x, i) => {
          const on = x === current;
          return (
            <View key={`${x.hours_before}-${i}`} style={[styles.tier, on && { backgroundColor: theme.bg }]}>
              <Text style={[styles.tierText, { color: on ? theme.text : theme.muted }]}>{label(x, i)}</Text>
              <Text style={[styles.tierText, { color: on ? theme.text : theme.muted, fontFamily: fonts.semibold }]}>{x.refund_pct}%</Text>
            </View>
          );
        })}
      </View>
      {preview?.paid ? <Text style={[styles.note, { color: theme.muted }]}>{t('bookings.refundWhere')}</Text> : null}
      {errorKey ? <Text style={[styles.note, { color: theme.danger }]}>{t(errorKey)}</Text> : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.btn, { flex: 1, backgroundColor: theme.bg }]}>
          <Text style={[styles.btnText, { color: theme.text }]}>{t('bookings.keepShort')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy || !preview} onPress={() => void confirm()} style={[styles.btn, { flex: 1.3, backgroundColor: theme.ink, opacity: busy || !preview ? 0.5 : 1 }]}>
          <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{t('bookings.cancel')}</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

/** "Com'è andata?": esito della sessione, lato venditore. */
export function OutcomeSheet({ who, minutesAgo, onClose, onDone }: { who: Who; minutesAgo: number; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [busy, setBusy] = useState<'completed' | 'no_show' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const when = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(who.startsAt));
  const first = who.otherName.split(' ')[0];

  const choose = async (value: 'completed' | 'no_show') => {
    setBusy(value);
    const e = await markBookingOutcome(who.id, value);
    setBusy(null);
    if (e) setErrorKey(e);
    else onDone();
  };

  return (
    <SheetShell visible onClose={onClose}>
      <Head who={who} sub={`${who.otherName} · ${when} · ${t('bookings.endedAgo', { minutes: Math.max(1, minutesAgo) })}`} />
      <Text style={[styles.h2, { color: theme.text }]}>{t('bookings.outcomeTitle')}</Text>
      <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void choose('completed')} style={[styles.option, { backgroundColor: theme.accent, opacity: busy === 'no_show' ? 0.5 : 1 }]}>
        <View style={[styles.optionIcon, { backgroundColor: theme.surface }]}>
          <Emoji name="raising_hands" size={28} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionTitle, { color: theme.onAccent }]}>{t('bookings.markCompleted')}</Text>
          <Text style={[styles.optionSub, { color: theme.onAccent }]}>{t('bookings.completedHint', { name: first })}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void choose('no_show')} style={[styles.option, { backgroundColor: theme.bg, opacity: busy === 'completed' ? 0.5 : 1 }]}>
        <View style={[styles.optionIcon, { backgroundColor: theme.surface }]}>
          <Emoji name="stopwatch" size={28} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.optionTitle, { color: theme.text }]}>{t('bookings.markNoShow')}</Text>
          <Text style={[styles.optionSub, { color: theme.muted }]}>{t('bookings.noShowShort')}</Text>
        </View>
      </Pressable>
      {errorKey ? <Text style={[styles.note, { color: theme.danger }]}>{t(errorKey)}</Text> : null}
      <Text style={[styles.note, { color: theme.muted }]}>{t('bookings.autoConclude')}</Text>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 18, paddingBottom: 28, gap: 14, maxWidth: 480, width: '100%', alignSelf: 'center' },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  headSub: { fontFamily: fonts.medium, fontSize: 13 },
  h2: { fontFamily: fonts.semibold, fontSize: 30, lineHeight: 32, letterSpacing: -1.2 },
  refund: { borderRadius: 28, paddingVertical: 16, paddingHorizontal: 18, gap: 4 },
  refundSmall: { fontFamily: fonts.semibold, fontSize: 14 },
  refundBig: { fontFamily: fonts.semibold, fontSize: 56, lineHeight: 58, letterSpacing: -3 },
  tier: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16 },
  tierText: { fontFamily: fonts.medium, fontSize: 14 },
  note: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 28, padding: 16 },
  optionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 18 },
  optionSub: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: 2 },
});
