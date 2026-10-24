import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AvailableNowCard } from '@/components/AvailableNowCard';
import { Body, Button, Card, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DAY_PARTS, HOURS, hourStart, isBusy, loadCalendar, setHours, type Calendar } from '@/lib/availability';
import { dayLabel, nextDays } from '@/lib/time';

const DAYS = 14;
const HOUR_MS = 3_600_000;

export default function AvailabilityScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [clock] = useState(() => Date.now());
  const [days] = useState(() => nextDays(DAYS, clock, true)); // da oggi
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
  // un'ora già finita non si può più aprire
  const editable = (s: number) => s + HOUR_MS > clock && !isBusy(calendar, s);
  const startsOf = (d: string, hours: string[]) => hours.map((h) => hourStart(d, h)).filter(editable);
  const dayStarts = startsOf(day, HOURS);

  const apply = async (list: number[], open: boolean) => {
    if (!userId || list.length === 0) return;
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

  // Le ore aperte del giorno scelto, replicate su tutti gli stessi giorni della settimana del periodo.
  const sameWeekdays = days.filter((d, i) => i !== dayIndex && (i - dayIndex) % 7 === 0);
  const replicate = () => {
    const openHours = HOURS.filter((h) => calendar.open.has(hourStart(day, h)));
    return sameWeekdays.flatMap((d) => startsOf(d, openHours));
  };

  const openCount = (d: string) => HOURS.filter((h) => calendar.open.has(hourStart(d, h))).length;

  return (
    <Screen>
      <Title>{t('availability.title')}</Title>
      <Body muted>{t('availability.intro')}</Body>
      <Spacer />
      {userId ? <AvailableNowCard userId={userId} /> : null}
      <Spacer />
      <Body>{t('availability.scheduled')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {days.map((d, i) => {
          const count = openCount(d);
          const label = i === 0 ? t('availability.today') : dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
          return <Chip key={d} label={`${label}${count ? ` · ${count}` : ''}`} selected={i === dayIndex} onPress={() => setDayIndex(i)} />;
        })}
      </ChipRow>
      <Spacer size={8} />
      <Body>{dayLabel(day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
      <Spacer size={8} />
      {DAY_PARTS.map((part) => {
        const list = startsOf(day, part.hours);
        const allOpen = list.length > 0 && list.every((s) => calendar.open.has(s));
        return (
          <Card key={part.key}>
            <Body>{t(`availability.${part.key}`)}</Body>
            <Spacer size={8} />
            <ChipRow>
              {part.hours.map((h) => {
                const s = hourStart(day, h);
                const busy = isBusy(calendar, s);
                const past = s + HOUR_MS <= clock;
                const isOpen = calendar.open.has(s);
                return (
                  <Chip
                    key={h}
                    label={`${h}${busy ? ` · ${t('availability.booked')}` : ''}`}
                    selected={isOpen || busy}
                    onPress={() => {
                      if (!busy && !past && !busyAction) void apply([s], !isOpen);
                    }}
                  />
                );
              })}
            </ChipRow>
            {list.length > 0 ? <Button title={t(allOpen ? 'availability.closePart' : 'availability.openPart')} variant="ghost" onPress={() => void apply(list, !allOpen)} loading={busyAction} /> : null}
          </Card>
        );
      })}
      <Body muted>{t('availability.legend')}</Body>
      <Spacer size={8} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('availability.openAll')} variant="ghost" onPress={() => void apply(dayStarts, true)} loading={busyAction} />
      <Spacer size={8} />
      <Button title={t('availability.closeAll')} variant="ghost" onPress={() => void apply(dayStarts, false)} loading={busyAction} />
      {sameWeekdays.length > 0 ? (
        <>
          <Spacer size={8} />
          <Button title={t('availability.repeat', { count: sameWeekdays.length })} variant="ghost" onPress={() => void apply(replicate(), true)} loading={busyAction} />
        </>
      ) : null}
      <Spacer size={16} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
