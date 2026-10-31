// Versione mobile (iOS/Android): PaymentSheet nativo di Stripe. Il pagamento vive sull'account del venditore (addebito diretto).
import { useState } from 'react';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, Spacer } from '@/components/ui';
import type { PaymentFormProps } from '@/components/payment-form.types';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

function Sheet({ clientSecret, onPaid }: Pick<PaymentFormProps, 'clientSecret' | 'onPaid'>) {
  const { t } = useTranslation();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setMessage(null);
    const init = await initPaymentSheet({ merchantDisplayName: 'Timeet', paymentIntentClientSecret: clientSecret, returnURL: 'timeet://stripe-redirect' });
    if (init.error) {
      setBusy(false);
      return setMessage(init.error.message);
    }
    const res = await presentPaymentSheet();
    setBusy(false);
    if (res.error) {
      if (res.error.code !== 'Canceled') setMessage(res.error.message);
    } else onPaid();
  };

  return (
    <>
      {message ? <ErrorText>{message}</ErrorText> : null}
      <Spacer size={8} />
      <Button title={t('book.pay')} onPress={() => void pay()} loading={busy} />
    </>
  );
}

export function PaymentForm({ clientSecret, stripeAccount, onPaid }: PaymentFormProps) {
  const { t } = useTranslation();
  if (!publishableKey) return <ErrorText>{t('errors.generic')}</ErrorText>;
  return (
    <StripeProvider publishableKey={publishableKey} stripeAccountId={stripeAccount} urlScheme="timeet">
      <Sheet clientSecret={clientSecret} onPaid={onPaid} />
    </StripeProvider>
  );
}
