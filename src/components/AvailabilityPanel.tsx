import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { DateField } from '@/components/DateField';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { TimeRangeSheet, formatDuration } from '@/components/TimeRangeSheet';
import { Body, Chip, ChipRow, ErrorText } from '@/components/ui';
import { DEFAULT_RANGE, MAX_RANGES, toMinutes, type DayRange, type DraftErrors, type ScheduleDraft } from '@/lib/availability';
import { fonts, useTheme } from '@/theme';

type Props = { draft: ScheduleDraft; onChange: (d: ScheduleDraft) => void; errors: DraftErrors };

const parseDate = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const short = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
};

/** Interruttore animato: acceso lime con pomello nero, spento grigio con pomello bianco. */
function Toggle({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const theme = useTheme();
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    x.set(withTiming(on ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) }));
  }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 20 }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.94}
      style={[styles.track, { backgroundColor: on ? theme.accent : theme.fill }]}>
      <Animated.View style={[styles.knob, { backgroundColor: on ? theme.ink : '#FFFFFF' }, !on && styles.knobShadow, knob]} />
    </Pressable>
  );
}

function Chevron({ open }: { open: boolean }) {
  const theme = useTheme();
  const r = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    r.set(withTiming(open ? 1 : 0, { duration: 180, easing: Easing.out(Easing.cubic) }));
  }, [open, r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get() * 180}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={18} color={theme.muted} />
    </Animated.View>
  );
}

/** Barra della giornata 0–24: decorativa, le fasce sono elencate sotto. */
function DayBar({ ranges, errored }: { ranges: DayRange[]; errored: Set<number> }) {
  const theme = useTheme();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, { backgroundColor: theme.fill }]}>
        {ranges.map((r, i) => {
          const a = toMinutes(r.start);
          const b = toMinutes(r.end);
          if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
          return <View key={i} style={[styles.seg, { left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%`, backgroundColor: errored.has(i) ? theme.danger : theme.primary }]} />;
        })}
      </View>
      <View style={styles.ticks}>
        {['00', '06', '12', '18', '24'].map((x) => (
          <Text key={x} style={[styles.tick, { color: theme.muted }]}>{x}</Text>
        ))}
      </View>
    </View>
  );
}

type SheetState = { day: number; idx: number; key: number; open: boolean } | null;

/** Orario settimanale a periodo: dal–al e sette giorni, ognuno aperto o chiuso con da 1 a 5 fasce. Usato per la generale, per un servizio e per un'offerta. */
export function AvailabilityPanel({ draft, onChange, errors }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dateEdit, setDateEdit] = useState<'startsOn' | 'endsOn' | null>(null);

  const dayName = (i: number) => new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(new Date(2026, 0, 5 + i)); // 5 gennaio 2026 = lunedì
  const dateText = (s: string) => {
    const d = parseDate(s);
    return d ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(d) : s || '—';
  };
  const setDay = (i: number, patch: Partial<ScheduleDraft['days'][number]>) => onChange({ ...draft, days: draft.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) });

  const copyTo = (from: number, targets: number[]) => {
    const source = draft.days[from];
    onChange({ ...draft, days: draft.days.map((d, i) => (targets.includes(i) ? { active: source.active, ranges: source.ranges.map((r) => ({ ...r })) } : d)) });
    setCopyFrom(null);
  };

  const start = parseDate(draft.startsOn);
  const end = parseDate(draft.endsOn);
  const weeks = start && end && end >= start ? Math.max(1, Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000 / 7)) : null;

  const weeklyMinutes = draft.days.reduce((sum, d) => (d.active ? sum + d.ranges.reduce((s, r) => {
    const m = toMinutes(r.end) - toMinutes(r.start);
    return Number.isNaN(m) || m < 0 ? s : s + m;
  }, 0) : sum), 0);

  const openSheet = (day: number, idx: number) => setSheet((s) => ({ day, idx, key: (s?.key ?? 0) + 1, open: true }));
  const sheetRange = sheet ? draft.days[sheet.day]?.ranges[sheet.idx] ?? DEFAULT_RANGE : DEFAULT_RANGE;

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.section, { color: theme.muted }]}>{t('availability.periodTitle')}</Text>
      <View style={[styles.period, { backgroundColor: theme.surface }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('availability.from')} onPress={() => setDateEdit('startsOn')} style={[styles.dateTile, { backgroundColor: theme.bg }]}>
          <Text style={[styles.dateLabel, { color: theme.muted }]}>{t('availability.from')}</Text>
          <Text style={[styles.dateValue, { color: theme.text }]}>{dateText(draft.startsOn)}</Text>
        </Pressable>
        <Ionicons name="arrow-forward" size={18} color={theme.muted} />
        <Pressable accessibilityRole="button" accessibilityLabel={t('availability.to')} onPress={() => setDateEdit('endsOn')} style={[styles.dateTile, { backgroundColor: theme.bg }]}>
          <Text style={[styles.dateLabel, { color: theme.muted }]}>{t('availability.to')}</Text>
          <Text style={[styles.dateValue, { color: theme.text }]}>{dateText(draft.endsOn)}</Text>
        </Pressable>
      </View>
      {weeks ? <Text style={[styles.weeks, { color: theme.muted }]}>{t('availability.periodWeeks', { count: weeks })}</Text> : null}
      {errors.period ? <ErrorText>{t('availability.errors.period')}</ErrorText> : null}

      <View style={styles.sectionRow}>
        <Text style={[styles.section, { color: theme.muted }]}>{t('availability.weeklyTitle')}</Text>
        <Text style={[styles.weeks, { color: theme.muted }]}>{t('availability.weeklyHours', { value: formatDuration(weeklyMinutes) })}</Text>
      </View>
      <View style={[styles.box, { backgroundColor: theme.surface }]}>
        {draft.days.map((day, i) => {
          const isOpen = day.active && openDay === i;
          const erroredIdx = new Set(day.ranges.map((_, j) => j).filter((j) => errors[`${i}:${j}`]));
          return (
            <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line }}>
              <View style={styles.header}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} disabled={!day.active} onPress={() => setOpenDay(isOpen ? null : i)} scaleTo={0.99} style={styles.dayMain}>
                  <Text style={[styles.dayName, { color: day.active ? theme.text : theme.muted }]}>{dayName(i).slice(0, 3)}</Text>
                  <Text numberOfLines={1} style={[styles.summary, { color: day.active ? theme.text : theme.muted }]}>
                    {day.active ? day.ranges.map((r) => `${short(r.start)}–${short(r.end)}`).join(' · ') : t('availability.closedDay')}
                  </Text>
                  {day.active ? <Chevron open={isOpen} /> : null}
                </Pressable>
                <Toggle
                  on={day.active}
                  label={`${dayName(i)} ${t('availability.open').toLowerCase()}`}
                  onPress={() => {
                    setDay(i, day.active ? { active: false } : { active: true, ranges: day.ranges.length ? day.ranges : [{ ...DEFAULT_RANGE }] });
                    if (!day.active) setOpenDay(i);
                  }}
                />
              </View>
              {isOpen ? (
                <View style={styles.edit}>
                  <DayBar ranges={day.ranges} errored={erroredIdx} />
                  {day.ranges.map((r, j) => {
                    const error = errors[`${i}:${j}`];
                    const label = `${r.start}–${r.end}`;
                    return (
                      <View key={j}>
                        <View style={styles.rangeLine}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            onPress={() => openSheet(i, j)}
                            scaleTo={0.985}
                            style={[styles.rangePill, { backgroundColor: theme.bg, borderColor: error ? theme.danger : 'transparent' }]}>
                            <Ionicons name="time-outline" size={18} color={theme.muted} />
                            <Text style={[styles.rangeTime, { color: theme.text }]}>{`${r.start} – ${r.end}`}</Text>
                            <Text style={[styles.rangeDur, { color: theme.muted }]}>{(() => {
                              const m = toMinutes(r.end) - toMinutes(r.start);
                              return Number.isNaN(m) || m <= 0 ? '' : formatDuration(m);
                            })()}</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('availability.removeRange', { range: label })}
                            onPress={() => setDay(i, { ranges: day.ranges.filter((_, idx) => idx !== j), active: day.ranges.length > 1 })}
                            style={styles.remove}>
                            <Ionicons name="close" size={20} color={theme.muted} />
                          </Pressable>
                        </View>
                        {error ? <ErrorText>{t(`availability.errors.${error}`)}</ErrorText> : null}
                      </View>
                    );
                  })}
                  {errors[`${i}:0`] === 'no_ranges' ? <ErrorText>{t('availability.errors.no_ranges')}</ErrorText> : null}
                  <View style={styles.actions}>
                    {day.ranges.length < MAX_RANGES ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          const next = nextRange(day.ranges);
                          setDay(i, { ranges: [...day.ranges, next] });
                          openSheet(i, day.ranges.length);
                        }}
                        style={[styles.add, { borderColor: theme.muted }]}>
                        <Ionicons name="add" size={20} color={theme.text} />
                        <Text style={[styles.actionText, { color: theme.text }]}>{t('availability.addRange')}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" onPress={() => setCopyFrom(copyFrom === i ? null : i)} style={[styles.copy, { backgroundColor: copyFrom === i ? theme.accent : theme.bg }]}>
                      <Ionicons name="copy-outline" size={18} color={copyFrom === i ? theme.onAccent : theme.text} />
                      <Text style={[styles.actionText, { color: copyFrom === i ? theme.onAccent : theme.text }]}>{t('availability.copyTo')}</Text>
                    </Pressable>
                  </View>
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

      {sheet ? (
        <TimeRangeSheet
          key={sheet.key}
          visible={sheet.open}
          title={t('availability.rangeLabel', { day: dayName(sheet.day), n: sheet.idx + 1 })}
          value={sheetRange}
          others={draft.days[sheet.day]?.ranges.filter((_, j) => j !== sheet.idx) ?? []}
          onClose={() => setSheet({ ...sheet, open: false })}
          onConfirm={(range) => {
            setDay(sheet.day, { ranges: draft.days[sheet.day].ranges.map((x, j) => (j === sheet.idx ? range : x)) });
            setSheet({ ...sheet, open: false });
          }}
          onDelete={() => {
            const ranges = draft.days[sheet.day].ranges;
            setDay(sheet.day, { ranges: ranges.filter((_, j) => j !== sheet.idx), active: ranges.length > 1 });
            setSheet({ ...sheet, open: false });
          }}
        />
      ) : null}

      <SheetModal visible={dateEdit !== null} onRequestClose={() => setDateEdit(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDateEdit(null)} />
        <View style={[styles.dateSheet, { backgroundColor: theme.surface }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          {dateEdit ? <DateField label={dateEdit === 'startsOn' ? t('availability.from') : t('availability.to')} value={draft[dateEdit]} onChange={(v) => onChange({ ...draft, [dateEdit]: v })} /> : null}
          <Pressable accessibilityRole="button" onPress={() => setDateEdit(null)} style={[styles.confirm, { backgroundColor: theme.primary }]}>
            <Text style={[styles.confirmText, { color: theme.onPrimary }]}>{t('availability.confirm')}</Text>
          </Pressable>
        </View>
      </SheetModal>
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
  section: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 10, marginLeft: 4 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  weeks: { fontFamily: fonts.medium, fontSize: 13, marginLeft: 4, marginRight: 4 },
  period: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 24, padding: 6 },
  dateTile: { flex: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  dateLabel: { fontFamily: fonts.medium, fontSize: 12 },
  dateValue: { fontFamily: fonts.semibold, fontSize: 16 },
  box: { borderRadius: 24, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  dayMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64 },
  dayName: { width: 40, fontFamily: fonts.semibold, fontSize: 16 },
  summary: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },
  track: { width: 52, height: 32, borderRadius: 16, justifyContent: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13, marginLeft: 3 },
  knobShadow: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  edit: { paddingBottom: 14, gap: 8 },
  bar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  seg: { position: 'absolute', top: 0, bottom: 0, borderRadius: 5 },
  ticks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tick: { fontFamily: fonts.medium, fontSize: 11 },
  rangeLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rangePill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5 },
  rangeTime: { fontFamily: fonts.semibold, fontSize: 17, fontVariant: ['tabular-nums'] },
  rangeDur: { marginLeft: 'auto', fontFamily: fonts.medium, fontSize: 13 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  add: { flex: 1, height: 44, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.8 },
  copy: { height: 44, borderRadius: 999, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: fonts.semibold, fontSize: 14 },
  backdrop: { flex: 1 },
  dateSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 30, gap: 8 },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  confirm: { height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  confirmText: { fontFamily: fonts.semibold, fontSize: 17 },
});
