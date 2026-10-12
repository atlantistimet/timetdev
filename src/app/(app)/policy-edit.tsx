import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Checkbox, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { deletePolicy, loadPolicy, savePolicy, STANDARD_TIERS, validateTiers, type Tier } from '@/lib/cancel-policy';

type Row = { hours: string; pct: string };
const toRows = (tiers: Tier[]): Row[] => tiers.map((tier) => ({ hours: String(tier.hours_before), pct: String(tier.refund_pct) }));

export default function PolicyEditScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(!id);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>(toRows(STANDARD_TIERS)); // si parte dalla policy standard
  const [isDefault, setIsDefault] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const policy = await loadPolicy(id);
      if (!active) return;
      if (policy) {
        setName(policy.name);
        setRows(toRows(policy.tiers));
        setIsDefault(policy.is_default);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (!ready) return <LoadingView />;

  const update = (index: number, patch: Partial<Row>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    if (!userId) return;
    const tiers: Tier[] = rows.map((row) => ({ hours_before: Number(row.hours), refund_pct: Number(row.pct) }));
    if (rows.some((row) => row.hours.trim() === '' || row.pct.trim() === '') || !name.trim()) {
      setErrorKey(name.trim() ? 'policy.errors.empty' : 'policy.errors.name');
      return;
    }
    const invalid = validateTiers(tiers);
    if (invalid) {
      setErrorKey(invalid);
      return;
    }
    setSaving(true);
    setErrorKey(null);
    const failure = await savePolicy({ id: id ?? null, sellerId: userId, name, tiers, isDefault });
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/policies');
  };

  const remove = async () => {
    if (!id) return;
    setSaving(true);
    const failure = await deletePolicy(id);
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/policies');
  };

  return (
    <Screen>
      <Title>{t(id ? 'policy.editTitle' : 'policy.newTitle')}</Title>
      <Body muted>{t('policy.editHelp')}</Body>
      <Spacer />
      <TextField label={t('policy.name')} value={name} onChangeText={setName} maxLength={60} />
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.cell}>
            <TextField label={t('policy.hoursLabel')} value={row.hours} onChangeText={(v) => update(index, { hours: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          </View>
          <View style={styles.cell}>
            <TextField label={t('policy.pctLabel')} value={row.pct} onChangeText={(v) => update(index, { pct: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          </View>
          <View style={styles.remove}>
            <Button title="✕" variant="ghost" onPress={() => setRows((current) => current.filter((_, i) => i !== index))} />
          </View>
        </View>
      ))}
      {rows.length < 8 ? <Button title={t('policy.addTier')} variant="ghost" onPress={() => setRows((current) => [...current, { hours: '', pct: '' }])} /> : null}
      <Spacer size={8} />
      <Checkbox label={t('policy.makeDefault')} checked={isDefault} onChange={setIsDefault} />
      <Spacer size={8} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      {id ? (
        <>
          <Spacer size={12} />
          <Button title={t('policy.delete')} variant="ghost" onPress={() => void remove()} loading={saving} />
        </>
      ) : null}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/policies')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  cell: { flex: 1 },
  remove: { width: 56, paddingBottom: 16 },
});
