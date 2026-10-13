import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, TextField } from '@/components/ui';
import { type Tier } from '@/lib/cancel-policy';

export type TierRow = { hours: string; pct: string };

export const toRows = (tiers: Tier[]): TierRow[] => tiers.map((tier) => ({ hours: String(tier.hours_before), pct: String(tier.refund_pct) }));
export const fromRows = (rows: TierRow[]): Tier[] => rows.map((row) => ({ hours_before: Number(row.hours), refund_pct: Number(row.pct) }));
export const rowsIncomplete = (rows: TierRow[]) => rows.some((row) => row.hours.trim() === '' || row.pct.trim() === '');

/** Righe "ore di anticipo / rimborso %" modificabili sul posto: si aggiungono e si tolgono come le fasce orarie. */
export function TierEditor({ rows, onChange }: { rows: TierRow[]; onChange: (rows: TierRow[]) => void }) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<TierRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.cell}>
            <TextField label={t('policy.hoursLabel')} value={row.hours} onChangeText={(v) => update(index, { hours: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          </View>
          <View style={styles.cell}>
            <TextField label={t('policy.pctLabel')} value={row.pct} onChangeText={(v) => update(index, { pct: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          </View>
          <View style={styles.remove}>
            <Button title="✕" variant="ghost" onPress={() => onChange(rows.filter((_, i) => i !== index))} />
          </View>
        </View>
      ))}
      {rows.length < 8 ? <Button title={t('policy.addTier')} variant="ghost" onPress={() => onChange([...rows, { hours: '', pct: '' }])} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  cell: { flex: 1 },
  remove: { width: 56, paddingBottom: 16 },
});
