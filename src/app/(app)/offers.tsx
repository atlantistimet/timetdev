import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyServices, type MyService } from '@/lib/offers';
import { formatEuro } from '@/lib/booking';

type Loaded = { services: MyService[]; errorKey: string | null };

export default function OffersScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const s = await listMyServices(userId);
      if (active) setLoaded(s);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!loaded) return <LoadingView />;

  const policyLabel = (service: MyService) => t(service.cancel_tiers ? 'offers.policyCustom' : 'offers.policyDefault');

  return (
    <Screen>
      <Title>{t('offers.title')}</Title>
      <Body muted>{t('offers.intro')}</Body>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {!loaded.errorKey && loaded.services.length === 0 ? <Body muted>{t('offers.empty')}</Body> : null}
      {loaded.services.map((service) => (
        <Card key={service.id}>
          <Body>
            {service.title}
            {service.active ? '' : ` · ${t('offers.paused')}`}
          </Body>
          <Body muted>
            {formatEuro(service.price_cents, i18n.language)} · {service.duration_min} min
          </Body>
          <Body muted>{t('offers.policyLine', { name: policyLabel(service) })}</Body>
          <Spacer size={8} />
          <Button title={t('offers.edit')} variant="ghost" onPress={() => router.push({ pathname: '/offer-edit', params: { id: service.id } })} />
        </Card>
      ))}
      <Spacer size={24} />
      <Button title={t('offers.new')} onPress={() => router.push('/offer-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
