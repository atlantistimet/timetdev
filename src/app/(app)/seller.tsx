import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AvailableNowCard } from '@/components/AvailableNowCard';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  loadSellerAccount,
  openStripeOnboarding,
  requestOnboardingUrl,
  sellerState,
  type SellerAccount,
} from '@/lib/seller';

export default function SellerScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<{ account: SellerAccount | null; errorKey: string | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const result = await loadSellerAccount(userId);
      if (active) setLoaded(result);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartErrorKey(null);
    const { url, errorKey } = await requestOnboardingUrl();
    if (url) {
      openStripeOnboarding(url);
    } else {
      setStartErrorKey(errorKey);
    }
    setStarting(false);
  }, []);

  if (!loaded) return <LoadingView />;

  const state = sellerState(loaded.account);

  return (
    <Screen>
      <Title>{t('seller.title')}</Title>
      <Body muted>{t(`seller.state.${state}`)}</Body>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {startErrorKey ? <ErrorText>{t(startErrorKey)}</ErrorText> : null}
      {state !== 'ready' ? (
        <Button
          title={t(state === 'none' ? 'seller.start' : 'seller.continue')}
          onPress={() => void start()}
          loading={starting}
        />
      ) : null}
      {userId ? <AvailableNowCard userId={userId} /> : null}
      <Spacer size={12} />
      <Button title={t('profileEdit.link')} variant="ghost" onPress={() => router.push('/profile-edit')} />
      <Spacer size={12} />
      <Button title={t('myServices.title')} variant="ghost" onPress={() => router.push('/my-services')} />
      <Spacer size={12} />
      <Button title={t('offers.title')} variant="ghost" onPress={() => router.push('/my-offers')} />
      <Spacer size={12} />
      <Button title={t('slotLinks.title')} variant="ghost" onPress={() => router.push('/slot-links')} />
      <Spacer size={12} />
      <Button title={t('availability.link')} variant="ghost" onPress={() => router.push('/availability')} />
      <Spacer size={12} />
      <Button title={t('policy.title')} variant="ghost" onPress={() => router.push('/policies')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/profile')} />
    </Screen>
  );
}
