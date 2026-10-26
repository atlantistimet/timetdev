import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listSpecificIds } from '@/lib/availability';
import { DeleteButton } from '@/components/DeleteButton';
import { countFutureBookings, deleteService, listMyServices, listPastServices, type MyService } from '@/lib/my-services';
import { formatEuro } from '@/lib/booking';

type Loaded = { services: MyService[]; past: MyService[]; errorKey: string | null; specific: Set<string> };

export default function MyServicesScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [s, ids, past] = await Promise.all([listMyServices(userId, ['slot', 'package', 'per_minute']), listSpecificIds(userId), listPastServices(userId)]);
      if (active) setLoaded({ ...s, past, specific: ids.services });
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

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
            {service.kind === 'per_minute'
              ? t('calls.rateLine', { price: formatEuro(service.rate_cents_per_min ?? 0, i18n.language) })
              : service.kind === 'package'
                ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: formatEuro(service.price_cents, i18n.language) })
                : `${formatEuro(service.price_cents, i18n.language)} · ${service.duration_min} min`}
          </Body>
          {loaded.specific.has(service.id) ? <Body muted>{t('availability.specificTag')}</Body> : null}
          {service.kind === 'per_minute' ? null : <Body muted>{t('myServices.policyLine', { name: policyLabel(service) })}</Body>}
          <Spacer size={8} />
          <Button title={t('myServices.edit')} variant="ghost" onPress={() => router.push({ pathname: '/service-edit', params: { id: service.id } })} />
          <Spacer size={8} />
          {service.kind === 'slot' ? <Button title={t('myServices.createOffer')} variant="ghost" onPress={() => router.push({ pathname: '/offer-edit', params: { serviceId: service.id } })} /> : null}
          <Spacer size={8} />
          <DeleteButton
            label={t('myServices.delete')}
            warning={t('myServices.deleteWarning')}
            loadCount={() => countFutureBookings('service_id', service.id)}
            onConfirm={async () => {
              await deleteService(service.id);
              setReloadKey((k) => k + 1);
            }}
          />
        </Card>
      ))}
      {loaded.past.length > 0 ? (
        <>
          <Spacer />
          <Title>{t('myServices.pastTitle')}</Title>
          <Body muted>{t('myServices.pastHelp')}</Body>
          {loaded.past.map((service) => (
            <Card key={service.id}>
              <Body>{service.title}</Body>
              <Body muted>
                {t('delete.deletedOn', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(service.deleted_at ?? 0)) })}
              </Body>
            </Card>
          ))}
        </>
      ) : null}
      <Spacer size={24} />
      <Button title={t('myServices.new')} onPress={() => router.push('/service-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
