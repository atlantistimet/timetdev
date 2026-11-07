import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
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
    <Screen back>
      <Title>{t('safety.delete.title')}</Title>
      <Body>{t('safety.delete.intro')}</Body>
      <Body muted>{t('safety.delete.l1')}</Body>
      <Body muted>{t('safety.delete.l2')}</Body>
      <Body muted>{t('safety.delete.l3')}</Body>
      <Body muted>{t('safety.delete.l4')}</Body>
      <Spacer />
      <TextField label={t('safety.delete.confirmLabel')} value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false} placeholder="ELIMINA" />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer size={8} />
      <Button title={t('safety.delete.confirm')} onPress={() => void go()} loading={busy} />
      <Button title={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
