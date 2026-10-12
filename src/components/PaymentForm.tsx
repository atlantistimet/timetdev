// Versione mobile (iOS/Android): il modulo carta nativo (@stripe/stripe-react-native) richiede una build di sviluppo
// e non è ancora collegato. Il pagamento si prova sul web.
import { useTranslation } from 'react-i18next';
import { Body } from '@/components/ui';
import type { PaymentFormProps } from '@/components/payment-form.types';

export function PaymentForm(_props: PaymentFormProps) {
  const { t } = useTranslation();
  return <Body muted>{t('book.nativeNotReady')}</Body>;
}
