import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { listSpecificIds } from '@/lib/availability';
import { DeleteButton } from '@/components/DeleteButton';
import { countFutureBookings } from '@/lib/my-services';
import { deleteOffer, finalPriceCents, listMyOffers, listPastOffers, validityText, type Offer } from '@/lib/offers';

export default function MyOffersScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<{ offers: Offer[]; past: Offer[]; errorKey: string | null; specific: Set<string> } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, ids, past] = await Promise.all([listMyOffers(userId), listSpecificIds(userId), listPastOffers(userId)]);
      if (active) setLoaded({ ...r, past, specific: ids.offers });
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

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
          {loaded.specific.has(offer.id) ? <Body muted>{t('availability.specificTag')}</Body> : null}
          <Spacer size={8} />
          <Button title={t('offers.edit')} variant="ghost" onPress={() => router.push({ pathname: '/offer-edit', params: { id: offer.id } })} />
          <Spacer size={8} />
          <DeleteButton
            label={t('offers.delete')}
            warning={t('offers.deleteWarning')}
            loadCount={() => countFutureBookings('offer_id', offer.id)}
            onConfirm={async () => {
              await deleteOffer(offer.id);
              setReloadKey((k) => k + 1);
            }}
          />
        </Card>
      ))}
      {loaded.past.length > 0 ? (
        <>
          <Spacer />
          <Title>{t('offers.pastTitle')}</Title>
          <Body muted>{t('offers.pastHelp')}</Body>
          {loaded.past.map((offer) => (
            <Card key={offer.id}>
              <Body>
                {offer.service_title}
                {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
              </Body>
              <Body muted>
                {t('delete.deletedOn', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(offer.deleted_at ?? 0)) })}
              </Body>
            </Card>
          ))}
        </>
      ) : null}
      <Spacer size={16} />
      <Button title={t('offers.new')} onPress={() => router.push('/offer-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
