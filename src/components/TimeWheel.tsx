import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { buzz, Pressable } from '@/components/Pressable';
import { fromMinutes, STEP_MIN, toMinutes } from '@/lib/availability';
import { fonts, useTheme } from '@/theme';

const ITEM = 44;
const ROWS = 5;
const HEIGHT = ITEM * ROWS;

const pad = (n: number) => String(n).padStart(2, '0');

function Column({ values, index, onIndex, unitKey }: { values: number[]; index: number; onIndex: (i: number) => void; unitKey: 'availability.hoursUnit' | 'availability.minutesUnit' }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const ref = useRef<ScrollView>(null);
  const current = useRef(index);
  const lastY = useRef(index * ITEM);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Posizione iniziale e cambi dall'esterno (scelte rapide, passaggio Inizio/Fine).
  useEffect(() => {
    if (current.current !== index || lastY.current !== index * ITEM) {
      current.current = index;
      lastY.current = index * ITEM;
      ref.current?.scrollTo({ y: index * ITEM, animated: false });
    }
  }, [index]);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM, animated: false }), 0);
    return () => clearTimeout(id);
    // solo al primo render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const settle = (y: number) => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(y / ITEM)));
    lastY.current = i * ITEM;
    if (Math.abs(y - i * ITEM) > 1) ref.current?.scrollTo({ y: i * ITEM, animated: true });
    if (i !== current.current) {
      current.current = i;
      buzz('select');
      onIndex(i);
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (timer.current) clearTimeout(timer.current);
    // sul web la fine dello slancio non è affidabile: si assesta anche dopo una breve pausa
    timer.current = setTimeout(() => settle(y), 120);
  };

  const step = (delta: number) => {
    const i = Math.min(values.length - 1, Math.max(0, index + delta));
    ref.current?.scrollTo({ y: i * ITEM, animated: true });
    settle(i * ITEM);
  };

  return (
    <View
      style={styles.col}
      accessible
      accessibilityRole="adjustable"
      accessibilityValue={{ text: `${values[index]} ${t(unitKey)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={(e) => {
          if (timer.current) clearTimeout(timer.current);
          settle(e.nativeEvent.contentOffset.y);
        }}
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}>
        {values.map((v, i) => {
          const d = Math.abs(i - index);
          return (
            <Pressable key={v} scaleTo={1} accessible={false} onPress={() => step(i - index)} style={styles.item}>
              <Text
                style={{
                  fontFamily: d === 0 ? fonts.semibold : fonts.medium,
                  fontSize: d === 0 ? 26 : d === 1 ? 20 : 17,
                  color: d === 0 ? theme.onAccent : theme.muted,
                  opacity: d >= 2 ? 0.6 : 1,
                  fontVariant: ['tabular-nums'],
                }}>
                {pad(v)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS_END = [...Array(25).keys()];
const HOURS_START = [...Array(24).keys()];
const MINUTES = [...Array(60 / STEP_MIN).keys()].map((i) => i * STEP_MIN);

/**
 * Rotella dell'orario (ore e minuti a passi di 15). `value` è "HH:MM"; con `allow24` l'ora può arrivare a 24 (e allora i minuti restano 00).
 * Il testo centrale usa il colore scuro del tema perché la banda è lime.
 */
export function TimeWheel({ value, onChange, allow24 }: { value: string; onChange: (v: string) => void; allow24?: boolean }) {
  const theme = useTheme();
  const total = toMinutes(value);
  const safe = Number.isNaN(total) ? 0 : total;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  const hours = allow24 ? HOURS_END : HOURS_START;
  const minuteIndex = Math.max(0, MINUTES.indexOf(minute));

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={[styles.band, { backgroundColor: theme.accent }]} />
      <Column
        values={hours}
        index={Math.min(hour, hours.length - 1)}
        unitKey="availability.hoursUnit"
        onIndex={(i) => onChange(fromMinutes(hours[i] === 24 ? 24 * 60 : hours[i] * 60 + minute))}
      />
      <Text style={[styles.colon, { color: theme.onAccent }]}>:</Text>
      <Column
        values={hour === 24 ? [0] : MINUTES}
        index={hour === 24 ? 0 : minuteIndex}
        unitKey="availability.minutesUnit"
        onIndex={(i) => onChange(fromMinutes(hour * 60 + MINUTES[i]))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  band: { position: 'absolute', left: 4, right: 4, top: ITEM * 2, height: ITEM, borderRadius: 14 },
  col: { width: 84, height: HEIGHT },
  item: { height: ITEM, alignItems: 'center', justifyContent: 'center' },
  colon: { fontFamily: fonts.semibold, fontSize: 26, marginTop: -3 },
});
