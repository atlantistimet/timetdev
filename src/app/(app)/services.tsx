import { Fragment, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, listSlotServices, type SlotService } from '@/lib/booking';

export default function ServicesScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [result, setResult] = useState<{ services: SlotService[]; errorKey: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const r = await listSlotServices(userId);
      if (active) setResult(r);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!result) return <LoadingView />;

  return (
    <Screen>
      <Title>{t('book.servicesTitle')}</Title>
      <Spacer />
      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}
      {!result.errorKey && result.services.length === 0 ? <Body muted>{t('book.noServices')}</Body> : null}
      {result.services.map((service) => (
        <Fragment key={service.id}>
          <Spacer size={12} />
          <Body>{service.title}</Body>
          <Body muted>
            {formatEuro(service.price_cents, i18n.language)} · {service.duration_min} min
          </Body>
          <Spacer size={8} />
          <Button
            title={t('book.choose')}
            variant="ghost"
            onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })}
          />
        </Fragment>
      ))}
      <Spacer size={24} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
