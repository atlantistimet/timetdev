import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, TextField } from '@/components/ui';
import { Group, GroupRow, Section, SettingsPage } from '@/components/settings';
import { useAuth } from '@/lib/auth';
import { deleteAccount } from '@/lib/safety';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const ok = text.trim().toUpperCase() === 'ELIMINA';

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    setErrorKey(null);
    const failure = await deleteAccount();
    setBusy(false);
    if (failure) return setErrorKey(failure);
    await signOut();
  };

  return (
    <SettingsPage title={t('safety.delete.title')} subtitle={t('safety.delete.intro')}>
      <Section label={t('safety.delete.what')}>
        <Group>
          <GroupRow plain icon="person-remove-outline" label={t('safety.delete.l1')} />
          <GroupRow plain icon="calendar-clear-outline" label={t('safety.delete.l2')} />
          <GroupRow plain icon="receipt-outline" label={t('safety.delete.l3')} />
          <GroupRow plain icon="refresh-outline" label={t('safety.delete.l4')} />
        </Group>
      </Section>
      <Section label={t('safety.delete.confirmSection')}>
        <TextField label={t('safety.delete.confirmLabel')} value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false} placeholder="ELIMINA" />
        {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      </Section>
      <Section>
        <Button title={t('safety.delete.confirm')} variant="danger" onPress={() => void go()} loading={busy} />
        <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </Section>
    </SettingsPage>
  );
}
