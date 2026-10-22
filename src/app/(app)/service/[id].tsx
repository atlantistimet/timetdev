import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MediaGallery } from '@/components/MediaView';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, loadSellerPlace, loadSlotService, type SellerPlace, type SlotService } from '@/lib/booking';
import { loadServiceTiers, type Tier } from '@/lib/cancel-policy';
import { loadProfileById, type PublicProfile } from '@/lib/public-profile';
import { type MediaItem } from '@/lib/media';
import { listPhotos } from '@/lib/service-media';

type Loaded = { service: SlotService; seller: PublicProfile | null; place: SellerPlace; photos: MediaItem[]; tiers: Tier[] } | 'missing';

export default function ServiceDetailScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const service = id ? await loadSlotService(id) : null;
      let result: Loaded = 'missing';
      if (service) {
        const [seller, place, photos, tiers] = await Promise.all([
          loadProfileById(service.seller_id),
          loadSellerPlace(service.seller_id),
          listPhotos(service.id).then((l) => l.map((x) => ({ path: x.path, type: x.type }))),
          loadServiceTiers(service.seller_id, service.cancel_tiers),
        ]);
        result = { service, seller, place, photos, tiers };
      }
      if (alive) setLoaded(result);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('book.errors.service_not_found')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }

  const { service, seller, place, photos, tiers } = loaded;
  const mine = session?.user.id === service.seller_id;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);

  return (
    <Screen>
      <MediaGallery items={photos} bucket="service-media" />
      <Title>{service.title}</Title>
      <Body muted>
        {service.kind === 'package'
          ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: fmt(service.price_cents) })
          : `${fmt(service.price_cents)} · ${service.duration_min} min`}
      </Body>
      {seller ? (
        <>
          <Spacer size={8} />
          <Button
            title={`${seller.full_name}${seller.role_title ? ` · ${seller.role_title}` : ''}`}
            variant="ghost"
            onPress={() => (seller.handle ? router.push({ pathname: '/u/[handle]', params: { handle: seller.handle } }) : undefined)}
          />
        </>
      ) : null}
      {service.description ? (
        <>
          <Spacer />
          <Body>{service.description}</Body>
        </>
      ) : null}
      {service.includes.length > 0 ? (
        <Card>
          <Body>{t('book.includesTitle')}</Body>
          {service.includes.map((line) => (
            <Body key={line} muted>
              ✓ {line}
            </Body>
          ))}
        </Card>
      ) : null}
      <Card>
        <Body>{t('book.where')}</Body>
        {service.places.map((p) => (
          <Body key={p} muted>
            {t(`places.${p}`)}
            {p === 'sede' && place.place_address ? ` · ${place.place_address}` : ''}
            {p === 'sede' && service.space_fee_cents > 0 ? ` · +${fmt(service.space_fee_cents)}` : ''}
            {p === 'domicilio' && place.service_area ? ` · ${place.service_area}` : ''}
            {p === 'domicilio' && place.travel_fee_cents > 0 ? ` · +${fmt(place.travel_fee_cents)}` : ''}
          </Body>
        ))}
      </Card>
      <Card>
        <Body>{t('policy.cancelRules')}</Body>
        <TierLines tiers={tiers} />
      </Card>
      <Spacer size={8} />
      {mine ? <ErrorText>{t('serviceDetail.mine')}</ErrorText> : <Button title={`${t('book.choose')} · ${fmt(service.price_cents)}`} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />}
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} />
    </Screen>
  );
}
