import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ErrorText } from '@/components/ui';
import { setAvailableNow } from '@/lib/explore';
import { supabase } from '@/lib/supabase';
import { fonts, useTheme } from '@/theme';

type Choice = 1 | 2 | 4 | 'today';

/** "Disponibile ora": scheda lime con interruttore; il venditore compare in Esplora per 1, 2 o 4 ore o fino a fine giornata. */
export function AvailableNowCard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [choice, setChoice] = useState<Choice>(2);
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

  const set = async (c: Choice | null) => {
    const t0 = Date.now();
    const midnight = new Date(t0);
    midnight.setHours(23, 59, 0, 0);
    const hours = c === null ? null : c === 'today' ? Math.max(0.25, (midnight.getTime() - t0) / 3_600_000) : c;
    const failure = await setAvailableNow(userId, hours);
    if (failure) return setErrorKey(failure);
    setErrorKey(null);
    setNow(t0);
    if (c) setChoice(c);
    setUntil(hours ? new Date(t0 + hours * 3_600_000).toISOString() : null);
  };

  const active = !!until && new Date(until).getTime() > now;
  const time = active ? new Date(until!).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : '';
  const choices: [Choice, string][] = [[1, '1 h'], [2, '2 h'], [4, '4 h'], ['today', t('explore.today')]];

  return (
    <View style={[styles.card, { backgroundColor: theme.accent }]}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.onAccent }]}>{t('explore.availableNow')}</Text>
          <Text style={[styles.sub, { color: theme.onAccent }]}>{active ? t('explore.activeUntil', { time }) : t('explore.availabilityHint')}</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: active }} accessibilityLabel={t('explore.availableNow')} onPress={() => void set(active ? null : choice)} style={[styles.track, { backgroundColor: active ? theme.ink : 'rgba(21,21,21,0.25)', alignItems: active ? 'flex-end' : 'flex-start' }]}>
          <View style={[styles.thumb, { backgroundColor: active ? theme.accent : '#FFFFFF' }]} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {choices.map(([c, label]) => {
          const on = choice === c && active;
          return (
            <Pressable key={String(c)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => void set(c)} style={[styles.chip, { backgroundColor: on ? theme.ink : 'rgba(255,255,255,0.65)' }]}>
              <Text style={[styles.chipText, { color: on ? '#FFFFFF' : theme.ink }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 34, padding: 18, gap: 22 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.4 },
  sub: { fontFamily: fonts.medium, fontSize: 14 },
  track: { width: 64, height: 38, borderRadius: 999, padding: 4, justifyContent: 'center' },
  thumb: { width: 30, height: 30, borderRadius: 15 },
  row: { flexDirection: 'row', gap: 6 },
  chip: { flex: 1, height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semibold, fontSize: 15 },
});
