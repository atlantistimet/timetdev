import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Body, Button, Spacer } from '@/components/ui';

/** "Elimina" con conferma sulla stessa schermata. `count` dice quante prenotazioni future restano valide. */
export function DeleteButton({ label, warning, loadCount, onConfirm }: { label: string; warning: string; loadCount: () => Promise<number>; onConfirm: () => Promise<void> }) {
  const { t } = useTranslation();
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (count === null) {
    return <Button title={label} variant="ghost" onPress={() => void loadCount().then(setCount)} />;
  }
  return (
    <>
      <Body>{warning}</Body>
      {count > 0 ? <Body muted>{t('delete.keepBookings', { count })}</Body> : <Body muted>{t('delete.noBookings')}</Body>}
      <Spacer size={8} />
      <Button
        title={t('delete.yes')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setCount(null);
        }}
      />
      <Spacer size={8} />
      <Button title={t('common.cancel')} variant="ghost" onPress={() => setCount(null)} />
    </>
  );
}
