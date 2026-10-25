import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AvailabilityPanel } from '@/components/AvailabilityPanel';
import { AvailableNowCard } from '@/components/AvailableNowCard';
import { DateField } from '@/components/DateField';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  addClosedDay, bookingsOutsideSchedule, cloneDraft, emptyDraft, listClosedDays, loadSchedule, loadWindows, removeClosedDay,
  saveSchedule, todayRome, validateDraft, type ClosedDay, type ScheduleDraft, type Window,
} from '@/lib/availability';
import { localParts } from '@/lib/validity';

const nowMs = () => Date.now();

/** Disponibilità generale: orario settimanale in un periodo, giorni chiusi e anteprima delle prossime due settimane. */
export default function AvailabilityScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [saved, setSaved] = useState<ScheduleDraft | null>(null);
  const [closed, setClosed] = useState<ClosedDay[]>([]);
  const [windows, setWindows] = useState<Window[]>([]);
  const [outside, setOutside] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [closedDay, setClosedDay] = useState('');
  const [closedNote, setClosedNote] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const t0 = nowMs();
      const today = todayRome(t0);
      const [stored, days, wins] = await Promise.all([
        loadSchedule(userId, 'general', null),
        listClosedDays(userId, today),
        loadWindows(userId, null, null, t0, t0 + 14 * 86_400_000),
      ]);
      if (!alive) return;
      const base = stored ? cloneDraft(stored) : emptyDraft(t0);
      setDraft((current) => current ?? base);
      setSaved(stored ? cloneDraft(stored) : null);
      setClosed(days);
      setWindows(wins);
    })();
    return () => {
      alive = false;
    };
  }, [userId, reload]);

  const errors = useMemo(() => (draft ? validateDraft(draft) : {}), [draft]);

  if (!draft) return <LoadingView />;

  const save = async () => {
    if (!userId) return;
    if (Object.keys(errors).length > 0) return setErrorKey('availability.errors.fix');
    setSaving(true);
    setErrorKey(null);
    setMessage(null);
    const failure = await saveSchedule('general', null, null, draft);
    if (failure) {
      setSaving(false);
      return setErrorKey(failure);
    }
    setOutside(await bookingsOutsideSchedule(userId));
    setSaving(false);
    setMessage(t('availability.saved'));
    setReload((n) => n + 1);
  };

  const addClosed = async () => {
    if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(closedDay)) return setErrorKey('availability.errors.closedDay');
    setErrorKey(null);
    const failure = await addClosedDay(userId, closedDay, closedNote);
    if (failure) return setErrorKey(failure);
    setClosedDay('');
    setClosedNote('');
    setReload((n) => n + 1);
  };
  const removeClosed = async (day: string) => {
    if (!userId) return;
    await removeClosedDay(userId, day);
    setReload((n) => n + 1);
  };

  const fmtDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
  };
  const fmtTime = (ms: number) => {
    const p = localParts(new Date(ms));
    return `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
  };
  // anteprima: finestre libere raggruppate per giorno (ora di Roma)
  const byDay = new Map<string, string[]>();
  for (const w of windows) {
    const day = localParts(new Date(w.from)).date;
    byDay.set(day, [...(byDay.get(day) ?? []), `${fmtTime(w.from)}–${w.to - w.from >= 86_400_000 ? '24:00' : fmtTime(w.to)}`]);
  }
  const previewDays = Array.from({ length: 14 }, (_, i) => todayRome(nowMs() + i * 86_400_000));
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <Screen>
      <Title>{t('availability.title')}</Title>
      <Body muted>{t('availability.intro')}</Body>
      <Spacer />
      {userId ? <AvailableNowCard userId={userId} /> : null}
      <Spacer />
      <Title>{t('availability.generalTitle')}</Title>
      <Body muted>{t('availability.generalHint')}</Body>
      <Spacer size={8} />
      <AvailabilityPanel draft={draft} onChange={setDraft} errors={errors} />

      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      {message ? <Body>{message}</Body> : null}
      {outside ? <ErrorText>{t('availability.outside', { count: outside })}</ErrorText> : null}
      <Button title={t('availability.save')} onPress={() => void save()} loading={saving} />
      {dirty ? <Body muted>{t('availability.unsaved')}</Body> : null}

      <Spacer />
      <Title>{t('availability.closedTitle')}</Title>
      <Body muted>{t('availability.closedHint')}</Body>
      <Spacer size={8} />
      <DateField label={t('availability.closedDayField')} value={closedDay} onChange={setClosedDay} />
      <TextField label={t('availability.closedNote')} value={closedNote} onChangeText={setClosedNote} maxLength={120} />
      <Button title={t('availability.closedAdd')} variant="ghost" onPress={() => void addClosed()} />
      <Spacer size={8} />
      {closed.map((c) => (
        <Card key={c.day}>
          <Body>{`${fmtDay(c.day)} ${c.day.slice(0, 4)}${c.note ? ` · ${c.note}` : ''}`}</Body>
          <Button title={t('availability.closedRemove')} variant="ghost" onPress={() => void removeClosed(c.day)} />
        </Card>
      ))}

      <Spacer />
      <Title>{t('availability.previewTitle')}</Title>
      <Body muted>{t('availability.previewHint')}</Body>
      <Spacer size={8} />
      <Card>
        {previewDays.map((day) => (
          <Body key={day} muted={!byDay.has(day)}>
            {`${fmtDay(day)} · ${byDay.get(day)?.join(', ') ?? t('availability.previewClosed')}`}
          </Body>
        ))}
      </Card>

      <Spacer size={16} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
