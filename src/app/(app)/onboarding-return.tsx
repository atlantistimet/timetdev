import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { refreshSellerStatus, sellerState, type SellerState } from '@/lib/seller';

/** Indirizzo di ritorno dall'onboarding di Stripe: rilegge lo stato e lo mostra. */
export default function OnboardingReturn() {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ state: SellerState; errorKey: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { account, errorKey } = await refreshSellerStatus();
      if (active) setResult({ state: sellerState(account), errorKey });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!result) return <LoadingView />;

  return (
    <Screen>
      <Title>{t('seller.returnTitle')}</Title>
      {result.errorKey ? (
        <ErrorText>{t(result.errorKey)}</ErrorText>
      ) : (
        <Body muted>{t(`seller.state.${result.state}`)}</Body>
      )}
      <Spacer />
      <Button title={t('seller.goToSeller')} onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
