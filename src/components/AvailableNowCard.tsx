import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Card, Chip, ChipRow, ErrorText, Spacer } from '@/components/ui';
import { setAvailableNow } from '@/lib/explore';
import { supabase } from '@/lib/supabase';

/** "Disponibile ora": il venditore compare in Esplora come disponibile per 1, 2 o 4 ore. */
export function AvailableNowCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('available_until').eq('id', userId).maybeSingle();
      if (!alive) return;
      setUntil((data as { available_until: string | null } | null)?.available_until ?? null);
      setNow(Date.now());
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const set = async (hours: number | null) => {
    const failure = await setAvailableNow(userId, hours);
    if (failure) return setErrorKey(failure);
    setErrorKey(null);
    const t0 = Date.now();
    setNow(t0);
    setUntil(hours ? new Date(t0 + hours * 3_600_000).toISOString() : null);
  };

  const active = !!until && new Date(until).getTime() > now;
  const time = active ? new Date(until!).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <Card>
      <Body>{t('explore.availability')}</Body>
      <Body muted>{active ? t('explore.activeUntil', { time }) : t('explore.availabilityHint')}</Body>
      <Spacer size={8} />
      <ChipRow>
        <Chip label={t('explore.hours1')} selected={false} onPress={() => void set(1)} />
        <Chip label={t('explore.hours2')} selected={false} onPress={() => void set(2)} />
        <Chip label={t('explore.hours4')} selected={false} onPress={() => void set(4)} />
        <Chip label={t('explore.off')} selected={!active} onPress={() => void set(null)} />
      </ChipRow>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </Card>
  );
}
