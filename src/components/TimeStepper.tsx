import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fromMinutes, STEP_MIN, toMinutes } from '@/lib/availability';
import { useTheme } from '@/theme';

/** Orario a passi di 15 minuti: ‹ › cambiano di 15 minuti, « » di un'ora. Tra min e max (minuti dalla mezzanotte). */
export function TimeStepper({ value, min, max, onChange, invalid }: { value: string; min: number; max: number; onChange: (v: string) => void; invalid?: boolean }) {
  const theme = useTheme();
  const current = toMinutes(value);
  const move = (delta: number) => onChange(fromMinutes(Math.min(max, Math.max(min, (Number.isNaN(current) ? min : current) + delta))));
  return (
    <View style={styles.row}>
      <StepButton label="«" delta={-60} onMove={move} />
      <StepButton label="‹" delta={-STEP_MIN} onMove={move} />
      <Text style={[styles.time, { color: invalid ? theme.danger : theme.text }]}>{value}</Text>
      <StepButton label="›" delta={STEP_MIN} onMove={move} />
      <StepButton label="»" delta={60} onMove={move} />
    </View>
  );
}

function StepButton({ label, delta, onMove }: { label: string; delta: number; onMove: (delta: number) => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${delta > 0 ? '+' : ''}${delta} min`} onPress={() => onMove(delta)} style={[styles.btn, { backgroundColor: theme.fill }]}>
      <Text style={{ color: theme.text, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  time: { minWidth: 52, textAlign: 'center', fontSize: 16, fontWeight: '600' },
});
