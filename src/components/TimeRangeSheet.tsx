import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { TimeWheel } from '@/components/TimeWheel';
import { toMinutes, type DayRange } from '@/lib/availability';
import { fonts, useTheme } from '@/theme';

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

const presets: { key: 'presetMorning' | 'presetAfternoon' | 'presetEvening'; start: string; end: string }[] = [
  { key: 'presetMorning', start: '09:00', end: '13:00' },
  { key: 'presetAfternoon', start: '14:00', end: '18:00' },
  { key: 'presetEvening', start: '18:00', end: '22:00' },
];

function Half({ active, label, time, onPress }: { active: boolean; label: string; time: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} scaleTo={0.98} style={[styles.half, active && { backgroundColor: theme.surface }]}>
      <Text style={[styles.halfLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.halfTime, { color: active ? theme.text : theme.muted }]}>{time}</Text>
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  /** Es. «Lunedì · fascia 1». */
  title: string;
  value: DayRange;
  /** Le altre fasce dello stesso giorno, per evitare le sovrapposizioni. */
  others?: DayRange[];
  onConfirm: (range: DayRange) => void;
  onDelete: () => void;
  onClose: () => void;
};

/** Foglio dal basso per cambiare una fascia. Si lavora su una copia: si applica solo con «Conferma». Va rimontato (key) a ogni apertura. */
export function TimeRangeSheet({ visible, title, value, others = [], onConfirm, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [range, setRange] = useState<DayRange>(value);
  const [editing, setEditing] = useState<'start' | 'end'>('start');

  const a = toMinutes(range.start);
  const b = toMinutes(range.end);
  const endBeforeStart = b <= a;
  const overlap = !endBeforeStart && others.some((o) => toMinutes(o.start) < b && toMinutes(o.end) > a);
  const invalid = endBeforeStart || overlap;

  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
        <View style={[styles.grab, { backgroundColor: theme.fill }]} />
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text style={[styles.sub, { color: theme.muted }]}>{title}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t('availability.editRange')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onClose} style={[styles.close, { backgroundColor: theme.bg }]}>
            <Ionicons name="close" size={22} color={theme.ink} />
          </Pressable>
        </View>

        <View style={[styles.switcher, { backgroundColor: theme.bg }]}>
          <Half active={editing === 'start'} label={t('availability.start')} time={range.start} onPress={() => setEditing('start')} />
          <Half active={editing === 'end'} label={t('availability.end')} time={range.end} onPress={() => setEditing('end')} />
        </View>

        <TimeWheel
          allow24={editing === 'end'}
          value={range[editing]}
          onChange={(v) => setRange((r) => ({ ...r, [editing]: v }))}
        />

        <Text style={[styles.quickLabel, { color: theme.muted }]}>{t('availability.quick')}</Text>
        <View style={styles.quick}>
          {presets.map((p) => {
            const on = range.start === p.start && range.end === p.end;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setRange({ start: p.start, end: p.end })}
                style={[styles.chip, on ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line }]}>
                <Text numberOfLines={1} style={[styles.chipText, { color: on ? theme.onAccent : theme.text }]}>{t(`availability.${p.key}`)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.info}>
          <Ionicons name="time-outline" size={18} color={invalid ? theme.danger : theme.muted} />
          <Text style={[styles.infoText, { color: invalid ? theme.danger : theme.muted }]}>
            {endBeforeStart ? t('availability.endBeforeStart') : overlap ? t('availability.errors.overlap') : t('availability.duration', { value: formatDuration(b - a) })}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onDelete} style={[styles.delete, { backgroundColor: theme.bg }]}>
            <Text style={[styles.deleteText, { color: theme.danger }]}>{t('availability.deleteRange')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: invalid }}
            disabled={invalid}
            onPress={() => onConfirm(range)}
            style={[styles.confirm, { backgroundColor: theme.primary, opacity: invalid ? 0.35 : 1 }]}>
            <Text style={[styles.confirmText, { color: theme.onPrimary }]}>{t('availability.confirm')}</Text>
          </Pressable>
        </View>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 30, alignSelf: 'center', width: '100%', maxWidth: 520 },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { fontFamily: fonts.medium, fontSize: 13 },
  title: { fontFamily: fonts.semibold, fontSize: 22 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  switcher: { flexDirection: 'row', borderRadius: 22, padding: 5, marginTop: 14, marginBottom: 6 },
  half: { flex: 1, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 14 },
  halfLabel: { fontFamily: fonts.medium, fontSize: 12 },
  halfTime: { fontFamily: fonts.semibold, fontSize: 24, fontVariant: ['tabular-nums'] },
  quickLabel: { fontFamily: fonts.medium, fontSize: 12, marginTop: 8, marginBottom: 6 },
  quick: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, height: 40, borderRadius: 999, borderWidth: 1, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 13 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 14 },
  infoText: { fontFamily: fonts.medium, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  delete: { height: 56, borderRadius: 999, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: fonts.semibold, fontSize: 16 },
  confirm: { flex: 1, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontFamily: fonts.semibold, fontSize: 17 },
});
