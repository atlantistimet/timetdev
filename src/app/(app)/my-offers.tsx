import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { finalPriceCents, listMyOffers, validityText, type Offer } from '@/lib/offers';

export default function MyOffersScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<{ offers: Offer[]; errorKey: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const r = await listMyOffers(userId);
      if (active) setLoaded(r);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!loaded) return <LoadingView />;

  return (
    <Screen>
      <Title>{t('offers.title')}</Title>
      <Body muted>{t('offers.intro')}</Body>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {!loaded.errorKey && loaded.offers.length === 0 ? <Body muted>{t('offers.empty')}</Body> : null}
      {loaded.offers.map((offer) => (
        <Card key={offer.id}>
          <Body>
            {offer.service_title}
            {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
            {offer.active ? '' : ` · ${t('offers.paused')}`}
          </Body>
          <Body muted>
            {formatEuro(finalPriceCents(offer), i18n.language)} · {offer.duration_min} min
          </Body>
          <Body muted>{validityText(offer.validity, i18n.language, t)}</Body>
          <Spacer size={8} />
          <Button title={t('offers.edit')} variant="ghost" onPress={() => router.push({ pathname: '/offer-edit', params: { id: offer.id } })} />
        </Card>
      ))}
      <Spacer size={16} />
      <Button title={t('offers.new')} onPress={() => router.push('/offer-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
