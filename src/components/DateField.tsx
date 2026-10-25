import { TextField } from '@/components/ui';

/** Telefono: campo di testo AAAA-MM-GG (il selettore del calendario c'è sul web). */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <TextField label={label} value={value} onChangeText={(v) => onChange(v.trim())} placeholder="AAAA-MM-GG" autoCapitalize="none" keyboardType="numbers-and-punctuation" />;
}
