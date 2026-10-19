import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { MediaGallery } from '@/components/MediaView';
import { useAuth } from '@/lib/auth';
import { formatEuro, listSlotServices, type SlotService } from '@/lib/booking';
import { type MediaItem } from '@/lib/media';
import { listCovers } from '@/lib/service-media';
import { finalPriceCents, listPublicOffers, validityText, type Offer } from '@/lib/offers';

export default function ServicesScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [result, setResult] = useState<{ services: SlotService[]; offers: Offer[]; covers: Record<string, MediaItem>; errorKey: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, o] = await Promise.all([listSlotServices(userId), listPublicOffers(userId)]);
      const covers = await listCovers(r.services.map((x) => x.id));
      if (active) setResult({ services: r.services, offers: o.offers, covers, errorKey: r.errorKey ?? o.errorKey });
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!result) return <LoadingView />;

  return (
    <Screen tabs>
      <Title>{t('book.servicesTitle')}</Title>
      <Spacer />
      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}
      {result.offers.length > 0 ? <Body>{t('book.offersTitle')}</Body> : null}
      {result.offers.map((offer) => (
        <Card key={offer.id}>
          <MediaGallery items={result.covers[offer.service_id] ? [result.covers[offer.service_id]] : []} bucket="service-media" size="small" />
          <Body>
            {offer.service_title}
            {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
          </Body>
          <Body muted>
            {formatEuro(finalPriceCents(offer), i18n.language)} · {offer.duration_min} min
          </Body>
          <Body muted>{validityText(offer.validity, i18n.language, t)}</Body>
          {offer.message ? <Body muted>{offer.message}</Body> : null}
          <Spacer size={8} />
          <Button
            title={t('book.choose')}
            variant="ghost"
            onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id } })}
          />
        </Card>
      ))}
      {result.offers.length > 0 && result.services.length > 0 ? <Body>{t('book.servicesSection')}</Body> : null}
      {!result.errorKey && result.services.length === 0 && result.offers.length === 0 ? <Body muted>{t('book.noServices')}</Body> : null}
      {result.services.map((service) => (
        <Card key={service.id}>
          <MediaGallery items={result.covers[service.id] ? [result.covers[service.id]] : []} bucket="service-media" size="small" />
          <Body>{service.title}</Body>
          <Body muted>
            {formatEuro(service.price_cents, i18n.language)} · {service.duration_min} min
          </Body>
          <Spacer size={8} />
          <Button title={t('publicProfile.details')} variant="ghost" onPress={() => router.push({ pathname: '/service/[id]', params: { id: service.id } })} />
          <Spacer size={8} />
          <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />
        </Card>
      ))}
    </Screen>
  );
}
