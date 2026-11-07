import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { loadOffer } from '@/lib/offers';

/** Pagina pubblica di un'offerta (timeet.world/o/<id>): porta alla prenotazione con l'offerta già scelta. */
export default function OfferLinkScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ serviceId: string } | 'missing' | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const offer = id ? await loadOffer(id) : null;
      if (alive) setState(offer ? { serviceId: offer.service_id } : 'missing');
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (!state) return <LoadingView />;
  if (state === 'missing') {
    return (
      <Screen>
        <Title>{t('offers.notFound')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} />
      </Screen>
    );
  }
  return <Redirect href={{ pathname: '/book', params: { serviceId: state.serviceId, offerId: id } }} />;
}
