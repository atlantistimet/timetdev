import { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, Spacer } from '@/components/ui';
import type { PaymentFormProps } from '@/components/payment-form.types';

const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

function CardForm({ onPaid }: Pick<PaymentFormProps, 'onPaid'>) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setMessage(null);
    const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    setBusy(false);
    if (error) setMessage(error.message ?? t('errors.generic'));
    else onPaid();
  };

  return (
    <>
      <PaymentElement />
      <Spacer size={16} />
      {message ? <ErrorText>{message}</ErrorText> : null}
      <Button title={t('book.pay')} onPress={() => void pay()} loading={busy || !stripe} />
    </>
  );
}

export function PaymentForm({ clientSecret, stripeAccount, onPaid }: PaymentFormProps) {
  const { t } = useTranslation();
  // Il pagamento esiste sull'account del venditore, quindi Stripe.js va inizializzato con quell'account.
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey, { stripeAccount }) : null),
    [stripeAccount],
  );
  if (!stripePromise) return <ErrorText>{t('errors.generic')}</ErrorText>;
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardForm onPaid={onPaid} />
    </Elements>
  );
}
