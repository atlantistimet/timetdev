import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { MediaGallery } from '@/components/MediaView';
import { NowBadge } from '@/components/NowBadge';
import { useAuth } from '@/lib/auth';
import { formatEuro, listSlotServices, type SlotService } from '@/lib/booking';
import { loadCategories, loadSellers, isAvailableNow, type Category, type Seller } from '@/lib/explore';
import { type MediaItem } from '@/lib/media';
import { listCovers } from '@/lib/service-media';
import { finalPriceCents, listPublicOffers, validityText, type Offer } from '@/lib/offers';

type Data = { services: SlotService[]; offers: Offer[]; covers: Record<string, MediaItem>; sellers: Record<string, Seller>; categories: Category[]; errorKey: string | null };

export default function ServicesScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [result, setResult] = useState<Data | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyNow, setOnlyNow] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, o, categories] = await Promise.all([listSlotServices(userId), listPublicOffers(userId), loadCategories(i18n.language)]);
      const [covers, sellers] = await Promise.all([listCovers(r.services.map((x) => x.id)), loadSellers([...r.services.map((x) => x.seller_id), ...o.offers.map((x) => x.seller_id)])]);
      if (active) {
        setNow(Date.now());
        setResult({ services: r.services, offers: o.offers, covers, sellers, categories, errorKey: r.errorKey ?? o.errorKey });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, i18n.language]);

  const filtered = useMemo(() => {
    if (!result) return { offers: [] as Offer[], services: [] as SlotService[] };
    const q = query.trim().toLowerCase();
    const ok = (sellerId: string, title: string) => {
      const seller = result.sellers[sellerId];
      if (category && !seller?.categories.includes(category)) return false;
      if (onlyNow && !isAvailableNow(seller, now)) return false;
      if (!q) return true;
      return [title, seller?.full_name, seller?.handle, seller?.role_title, seller?.city].some((v) => v?.toLowerCase().includes(q));
    };
    return {
      offers: result.offers.filter((o) => ok(o.seller_id, o.service_title)),
      services: result.services.filter((s) => ok(s.seller_id, s.title)),
    };
  }, [result, query, category, onlyNow, now]);

  if (!result) return <LoadingView />;

  const byline = (sellerId: string) => {
    const s = result.sellers[sellerId];
    return s ? t('explore.by', { name: s.full_name }) : null;
  };
  const openSeller = (sellerId: string) => {
    const handle = result.sellers[sellerId]?.handle;
    if (handle) router.push({ pathname: '/u/[handle]', params: { handle } });
  };
  const nothing = filtered.offers.length === 0 && filtered.services.length === 0;

  return (
    <Screen tabs>
      <Title>{t('book.servicesTitle')}</Title>
      <Spacer />
      <TextField label={t('explore.search')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      <ChipRow>
        <Chip label={t('explore.availableNow')} selected={onlyNow} onPress={() => setOnlyNow((v) => !v)} />
      </ChipRow>
      <Spacer size={8} />
      <ChipRow>
        <Chip label={t('explore.allCategories')} selected={category === null} onPress={() => setCategory(null)} />
        {result.categories.map((c) => (
          <Chip key={c.key} label={c.name} selected={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} />
        ))}
      </ChipRow>
      <Spacer />
      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}
      {filtered.offers.length > 0 ? <Body>{t('book.offersTitle')}</Body> : null}
      {filtered.offers.map((offer) => (
        <Card key={offer.id}>
          <MediaGallery items={result.covers[offer.service_id] ? [result.covers[offer.service_id]] : []} bucket="service-media" size="small" />
          <Body>
            {offer.service_title}
            {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
          </Body>
          {byline(offer.seller_id) ? <Body muted>{byline(offer.seller_id)}</Body> : null}
          {isAvailableNow(result.sellers[offer.seller_id], now) ? <NowBadge /> : null}
          <Body muted>
            {formatEuro(finalPriceCents(offer), i18n.language)} · {offer.duration_min} min
          </Body>
          <Body muted>{validityText(offer.validity, i18n.language, t)}</Body>
          {offer.message ? <Body muted>{offer.message}</Body> : null}
          <Spacer size={8} />
          {result.sellers[offer.seller_id]?.handle ? <Button title={t('explore.viewProfile')} variant="ghost" onPress={() => openSeller(offer.seller_id)} /> : null}
          <Spacer size={8} />
          {isAvailableNow(result.sellers[offer.seller_id], now) ? (
            <>
              <Button title={t('book.instantNow')} onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id, instant: '1' } })} />
              <Spacer size={8} />
            </>
          ) : null}
          <Button title={t('book.choose')} variant={isAvailableNow(result.sellers[offer.seller_id], now) ? 'ghost' : 'primary'} onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id } })} />
        </Card>
      ))}
      {filtered.offers.length > 0 && filtered.services.length > 0 ? <Body>{t('book.servicesSection')}</Body> : null}
      {!result.errorKey && nothing ? <Body muted>{result.services.length === 0 && result.offers.length === 0 ? t('book.noServices') : t('explore.noResults')}</Body> : null}
      {filtered.services.map((service) => (
        <Card key={service.id}>
          <MediaGallery items={result.covers[service.id] ? [result.covers[service.id]] : []} bucket="service-media" size="small" />
          <Body>{service.title}</Body>
          {byline(service.seller_id) ? <Body muted>{byline(service.seller_id)}</Body> : null}
          {isAvailableNow(result.sellers[service.seller_id], now) ? <NowBadge /> : null}
          <Body muted>
            {service.kind === 'package'
              ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: formatEuro(service.price_cents, i18n.language) })
              : `${formatEuro(service.price_cents, i18n.language)} · ${service.duration_min} min`}
          </Body>
          <Spacer size={8} />
          <Button title={t('publicProfile.details')} variant="ghost" onPress={() => router.push({ pathname: '/service/[id]', params: { id: service.id } })} />
          <Spacer size={8} />
          {service.kind === 'slot' && isAvailableNow(result.sellers[service.seller_id], now) ? (
            <>
              <Button title={t('book.instantNow')} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id, instant: '1' } })} />
              <Spacer size={8} />
            </>
          ) : null}
          <Button title={t('book.choose')} variant={service.kind === 'slot' && isAvailableNow(result.sellers[service.seller_id], now) ? 'ghost' : 'primary'} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />
        </Card>
      ))}
    </Screen>
  );
}
