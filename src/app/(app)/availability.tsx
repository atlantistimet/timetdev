import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { HOURS, hourStart, isBusy, loadCalendar, setHours, type Calendar } from '@/lib/availability';
import { dayLabel, nextDays } from '@/lib/time';

const DAYS = 14;

export default function AvailabilityScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [days] = useState(() => nextDays(DAYS, Date.now()));
  const [dayIndex, setDayIndex] = useState(0);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const r = await loadCalendar(userId, days[0], days[DAYS - 1]);
      if (!active) return;
      setCalendar(r.calendar);
      setErrorKey(r.errorKey);
    })();
    return () => {
      active = false;
    };
  }, [userId, days]);

  if (!calendar) return errorKey ? <Screen><ErrorText>{t(errorKey)}</ErrorText></Screen> : <LoadingView />;

  const day = days[dayIndex];
  const starts = HOURS.map((h) => hourStart(day, h));
  const free = starts.filter((s) => !isBusy(calendar, s));

  const apply = async (list: number[], open: boolean) => {
    if (!userId) return;
    setBusyAction(true);
    setErrorKey(null);
    const failure = await setHours(userId, list, open);
    setBusyAction(false);
    if (failure) {
      setErrorKey(failure);
      return;
    }
    setCalendar((current) => {
      if (!current) return current;
      const next = new Set(current.open);
      list.forEach((s) => (open ? next.add(s) : next.delete(s)));
      return { ...current, open: next };
    });
  };

  return (
    <Screen>
      <Title>{t('availability.title')}</Title>
      <Body muted>{t('availability.intro')}</Body>
      <Spacer />
      <ChipRow>
        {days.map((d, i) => {
          const count = HOURS.filter((h) => calendar.open.has(hourStart(d, h))).length;
          return (
            <Chip
              key={d}
              label={`${dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })}${count ? ` · ${count}` : ''}`}
              selected={i === dayIndex}
              onPress={() => setDayIndex(i)}
            />
          );
        })}
      </ChipRow>
      <Body>{dayLabel(day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
      <Spacer size={8} />
      <ChipRow>
        {starts.map((s, i) => {
          const busy = isBusy(calendar, s);
          const isOpen = calendar.open.has(s);
          return (
            <Chip
              key={s}
              label={`${HOURS[i]}${busy ? ` · ${t('availability.booked')}` : ''}`}
              selected={isOpen || busy}
              onPress={() => {
                if (!busy && !busyAction) void apply([s], !isOpen);
              }}
            />
          );
        })}
      </ChipRow>
      <Body muted>{t('availability.legend')}</Body>
      <Spacer size={8} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('availability.openAll')} variant="ghost" onPress={() => void apply(free, true)} loading={busyAction} />
      <Spacer size={8} />
      <Button title={t('availability.closeAll')} variant="ghost" onPress={() => void apply(free, false)} loading={busyAction} />
      <Spacer size={8} />
      <Button title={t('availability.copyWeek')} variant="ghost" onPress={() => void apply(copyToSameWeekday(days, dayIndex, calendar), true)} loading={busyAction} />
      <Spacer size={16} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}

/** Le ore aperte del giorno scelto, replicate sullo stesso giorno della settimana successivo (se rientra nei 14 giorni). */
function copyToSameWeekday(days: string[], index: number, calendar: Calendar): number[] {
  const target = days[index + 7] ?? days[index - 7];
  if (!target) return [];
  return HOURS.filter((h) => calendar.open.has(hourStart(days[index], h)))
    .map((h) => hourStart(target, h))
    .filter((s) => !isBusy(calendar, s));
}
