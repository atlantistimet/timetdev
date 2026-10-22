import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyServices, type MyService } from '@/lib/my-services';
import { formatEuro } from '@/lib/booking';

type Loaded = { services: MyService[]; errorKey: string | null };

export default function MyServicesScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const s = await listMyServices(userId, ['slot', 'package']);
      if (active) setLoaded(s);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!loaded) return <LoadingView />;

  const policyLabel = (service: MyService) => t(service.cancel_tiers ? 'myServices.policyCustom' : 'myServices.policyDefault');

  return (
    <Screen>
      <Title>{t('myServices.title')}</Title>
      <Body muted>{t('myServices.intro')}</Body>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {!loaded.errorKey && loaded.services.length === 0 ? <Body muted>{t('myServices.empty')}</Body> : null}
      {loaded.services.map((service) => (
        <Card key={service.id}>
          <Body>
            {service.title}
            {service.active ? '' : ` · ${t('myServices.paused')}`}
          </Body>
          <Body muted>
            {service.kind === 'package'
              ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: formatEuro(service.price_cents, i18n.language) })
              : `${formatEuro(service.price_cents, i18n.language)} · ${service.duration_min} min`}
          </Body>
          <Body muted>{t('myServices.policyLine', { name: policyLabel(service) })}</Body>
          <Spacer size={8} />
          <Button title={t('myServices.edit')} variant="ghost" onPress={() => router.push({ pathname: '/service-edit', params: { id: service.id } })} />
          <Spacer size={8} />
          {service.kind === 'slot' ? <Button title={t('myServices.createOffer')} variant="ghost" onPress={() => router.push({ pathname: '/offer-edit', params: { serviceId: service.id } })} /> : null}
        </Card>
      ))}
      <Spacer size={24} />
      <Button title={t('myServices.new')} onPress={() => router.push('/service-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
