import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TierEditor, fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { Body, Button, Checkbox, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { deletePolicy, loadPolicy, savePolicy, STANDARD_TIERS, validateTiers } from '@/lib/cancel-policy';

export default function PolicyEditScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(!id);
  const [name, setName] = useState('');
  const [rows, setRows] = useState<TierRow[]>(toRows(STANDARD_TIERS)); // si parte dalla policy standard
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

  const save = async () => {
    if (!userId) return;
    const tiers = fromRows(rows);
    if (rowsIncomplete(rows) || !name.trim()) {
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
      <TierEditor rows={rows} onChange={setRows} />
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

