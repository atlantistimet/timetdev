import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Schermata per chi ha un account ma non ha ancora dichiarato la maggiore età (per esempio chi entra con Apple o Google). */
export default function AdultGate() {
  const { t } = useTranslation();
  const { confirmAdult, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setErrorKey(null);
    try {
      // Se va a buon fine, la protezione delle route porta all'app.
      setErrorKey(await confirmAdult());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('auth.adultGate.title')}</Title>
      <Body muted>{t('auth.adultGate.body')}</Body>
      <Spacer size={24} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('auth.adultGate.confirm')} onPress={onConfirm} loading={busy} />
      <Spacer size={12} />
      <Button title={t('settings.signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
