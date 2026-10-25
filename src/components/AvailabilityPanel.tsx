import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DateField } from '@/components/DateField';
import { TimeStepper } from '@/components/TimeStepper';
import { Body, Card, Chip, ChipRow, ErrorText, Spacer } from '@/components/ui';
import { DEFAULT_RANGE, MAX_RANGES, type DraftErrors, type ScheduleDraft } from '@/lib/availability';

type Props = { draft: ScheduleDraft; onChange: (d: ScheduleDraft) => void; errors: DraftErrors };

/** Orario settimanale a periodo: dal–al e sette giorni, ognuno aperto o chiuso con da 1 a 5 fasce. Usato per la generale, per un servizio e per un'offerta. */
export function AvailabilityPanel({ draft, onChange, errors }: Props) {
  const { t, i18n } = useTranslation();
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const dayName = (i: number) => new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date(2026, 0, 5 + i)); // 5 gennaio 2026 = lunedì
  const setDay = (i: number, patch: Partial<ScheduleDraft['days'][number]>) => onChange({ ...draft, days: draft.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const copyTo = (from: number, targets: number[]) => {
    const source = draft.days[from];
    onChange({ ...draft, days: draft.days.map((d, i) => (targets.includes(i) ? { active: source.active, ranges: source.ranges.map((r) => ({ ...r })) } : d)) });
    setCopyFrom(null);
  };

  return (
    <View>
      <DateField label={t('availability.from')} value={draft.startsOn} onChange={(v) => onChange({ ...draft, startsOn: v })} />
      <DateField label={t('availability.to')} value={draft.endsOn} onChange={(v) => onChange({ ...draft, endsOn: v })} />
      {errors.period ? <ErrorText>{t('availability.errors.period')}</ErrorText> : null}
      <Spacer size={8} />
      {draft.days.map((day, i) => (
        <Card key={i}>
          <View style={styles.header}>
            <Body>{dayName(i)}</Body>
            <Chip
              label={t(day.active ? 'availability.open' : 'availability.closedDay')}
              selected={day.active}
              onPress={() => setDay(i, day.active ? { active: false } : { active: true, ranges: day.ranges.length ? day.ranges : [{ ...DEFAULT_RANGE }] })}
            />
          </View>
          {day.active ? (
            <>
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
            </>
          ) : null}
        </Card>
      ))}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  range: { marginBottom: 8 },
  rangeLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
