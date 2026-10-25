import { createElement } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme';

/** Web: selettore data del browser. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 6 }}>{label}</Text>
      {createElement('input', {
        type: 'date',
        value,
        onChange: (e: { target: { value: string } }) => onChange(e.target.value),
        style: { backgroundColor: theme.fill, color: theme.text, border: 'none', borderRadius: 12, padding: '12px 14px', fontSize: 16, fontFamily: 'inherit' },
      })}
    </View>
  );
}
