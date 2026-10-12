import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { openStripeOnboarding, requestOnboardingUrl } from '@/lib/seller';

/** Il link di Stripe è scaduto o già usato: ne chiediamo uno nuovo e ripartiamo. */
export default function OnboardingRefresh() {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { url, errorKey: key } = await requestOnboardingUrl();
      if (!active) return;
      if (url) openStripeOnboarding(url);
      else setErrorKey(key);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!errorKey) return <LoadingView />;

  return (
    <Screen>
      <Title>{t('seller.title')}</Title>
      <ErrorText>{t(errorKey)}</ErrorText>
      <Spacer />
      <Button title={t('seller.goToSeller')} onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
