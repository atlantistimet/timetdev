import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DateField } from '@/components/DateField';
import { TimeStepper } from '@/components/TimeStepper';
import { Body, Chip, ChipRow, ErrorText } from '@/components/ui';
import { DEFAULT_RANGE, MAX_RANGES, type DraftErrors, type ScheduleDraft } from '@/lib/availability';
import { fonts, useTheme } from '@/theme';

type Props = { draft: ScheduleDraft; onChange: (d: ScheduleDraft) => void; errors: DraftErrors };

/** Orario settimanale a periodo: dal–al e sette giorni, ognuno aperto o chiuso con da 1 a 5 fasce. Usato per la generale, per un servizio e per un'offerta. */
export function AvailabilityPanel({ draft, onChange, errors }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const dayName = (i: number) => new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date(2026, 0, 5 + i)); // 5 gennaio 2026 = lunedì
  const setDay = (i: number, patch: Partial<ScheduleDraft['days'][number]>) => onChange({ ...draft, days: draft.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const copyTo = (from: number, targets: number[]) => {
    const source = draft.days[from];
    onChange({ ...draft, days: draft.days.map((d, i) => (targets.includes(i) ? { active: source.active, ranges: source.ranges.map((r) => ({ ...r })) } : d)) });
    setCopyFrom(null);
  };

  const short = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.box, { backgroundColor: theme.surface }]}>
        <DateField label={t('availability.from')} value={draft.startsOn} onChange={(v) => onChange({ ...draft, startsOn: v })} />
        <DateField label={t('availability.to')} value={draft.endsOn} onChange={(v) => onChange({ ...draft, endsOn: v })} />
        {errors.period ? <ErrorText>{t('availability.errors.period')}</ErrorText> : null}
      </View>
      <View style={[styles.box, { backgroundColor: theme.surface, paddingVertical: 6 }]}>
        {draft.days.map((day, i) => {
          const isOpen = openDay === i;
          return (
            <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.fill }}>
              <View style={styles.header}>
                <Pressable accessibilityRole="button" onPress={() => setOpenDay(isOpen ? null : i)} style={styles.dayMain}>
                  <Text style={[styles.dayName, { color: day.active ? theme.text : theme.muted }]}>{dayName(i).slice(0, 3)}</Text>
                  <View style={styles.pills}>
                    {day.active ? day.ranges.map((r, j) => (
                      <View key={j} style={[styles.pill, { backgroundColor: theme.bg }]}>
                        <Text style={[styles.pillText, { color: theme.text }]}>{`${short(r.start)}–${short(r.end)}`}</Text>
                      </View>
                    )) : <Text style={[styles.pillText, { color: theme.muted }]}>{t('availability.closedDay')}</Text>}
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: day.active }}
                  accessibilityLabel={dayName(i)}
                  onPress={() => {
                    setDay(i, day.active ? { active: false } : { active: true, ranges: day.ranges.length ? day.ranges : [{ ...DEFAULT_RANGE }] });
                    if (!day.active) setOpenDay(i);
                  }}
                  style={[styles.dot, day.active ? { backgroundColor: theme.accent, borderColor: theme.ink } : { backgroundColor: theme.surface, borderColor: theme.fill }]}
                />
              </View>
              {day.active && isOpen ? (
                <View style={styles.edit}>
                  {day.ranges.map((r, j) => {
                    const error = errors[`${i}:${j}`];
                    const update = (patch: Partial<typeof r>) => setDay(i, { ranges: day.ranges.map((x, idx) => (idx === j ? { ...x, ...patch } : x)) });
                    return (
                      <View key={j} style={styles.range}>
                        <View style={styles.rangeLine}>
                          <TimeStepper value={r.start} min={0} max={23 * 60 + 45} onChange={(v) => update({ start: v })} invalid={!!error} />
                          <Body muted>–</Body>
                          <TimeStepper value={r.end} min={15} max={24 * 60} onChange={(v) => update({ end: v })} invalid={!!error} />
                          <Chip label="×" selected={false} onPress={() => setDay(i, { ranges: day.ranges.filter((_, idx) => idx !== j), active: day.ranges.length > 1 })} />
                        </View>
                        {error ? <ErrorText>{t(`availability.errors.${error}`)}</ErrorText> : null}
                      </View>
                    );
                  })}
                  {errors[`${i}:0`] === 'no_ranges' ? <ErrorText>{t('availability.errors.no_ranges')}</ErrorText> : null}
                  <ChipRow>
                    {day.ranges.length < MAX_RANGES ? (
                      <Chip label={t('availability.addRange')} selected={false} onPress={() => setDay(i, { ranges: [...day.ranges, nextRange(day.ranges)] })} />
                    ) : null}
                    <Chip label={t('availability.copyTo')} selected={copyFrom === i} onPress={() => setCopyFrom(copyFrom === i ? null : i)} />
                  </ChipRow>
                  {copyFrom === i ? (
                    <>
                      <Body muted>{t('availability.copyHint')}</Body>
                      <ChipRow>
                        {draft.days.map((_, k) => (k === i ? null : <Chip key={k} label={dayName(k).slice(0, 3)} selected={false} onPress={() => copyTo(i, [k])} />))}
                        <Chip label={t('availability.copyAll')} selected={false} onPress={() => copyTo(i, draft.days.map((_, k) => k).filter((k) => k !== i))} />
                      </ChipRow>
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** La fascia successiva: parte dove finisce l'ultima, per un'ora (o alle 09:00 se non ce ne sono). */
function nextRange(ranges: { start: string; end: string }[]) {
  const last = ranges[ranges.length - 1];
  if (!last) return { ...DEFAULT_RANGE };
  const [h, m] = last.end.split(':').map(Number);
  const start = h * 60 + m + 60;
  const end = Math.min(24 * 60, start + 60);
  if (start >= 24 * 60) return { ...DEFAULT_RANGE };
  const f = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  return { start: f(start), end: f(end) };
}

const styles = StyleSheet.create({
  box: { borderRadius: 30, paddingHorizontal: 14, paddingVertical: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dayMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayName: { width: 40, fontFamily: fonts.semibold, fontSize: 16 },
  pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { height: 32, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontFamily: fonts.semibold, fontSize: 13 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  edit: { paddingBottom: 12, gap: 8 },
  range: { marginBottom: 8 },
  rangeLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
