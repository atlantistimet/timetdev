import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { MediaGallery } from '@/components/MediaView';
import { Body, Button, Card, ErrorText, LoadingView, Pill, Screen, Spacer, TextField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, listSlotServices, type SlotService } from '@/lib/booking';
import {
  isAvailableNow,
  loadCategories,
  loadSellers,
  loadServiceRatings,
  type Category,
  type Seller,
  type ServiceRating,
} from '@/lib/explore';
import { type MediaItem } from '@/lib/media';
import { finalPriceCents, listPublicOffers, validityText, type Offer } from '@/lib/offers';
import { listCovers } from '@/lib/service-media';
import { fonts, pastelFor, radius, type, useTheme } from '@/theme';

type Data = {
  services: SlotService[];
  offers: Offer[];
  covers: Record<string, MediaItem>;
  sellers: Record<string, Seller>;
  ratings: Record<string, ServiceRating>;
  categories: Category[];
  errorKey: string | null;
};

export default function ServicesScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session, profile } = useAuth();
  const userId = session?.user.id ?? null;
  const [result, setResult] = useState<Data | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, o, categories] = await Promise.all([listSlotServices(userId), listPublicOffers(userId), loadCategories(i18n.language)]);
      const [covers, sellers, ratings] = await Promise.all([
        listCovers(r.services.map((x) => x.id)),
        loadSellers([...r.services.map((x) => x.seller_id), ...o.offers.map((x) => x.seller_id)]),
        loadServiceRatings(r.services.map((x) => x.id)),
      ]);
      if (active) {
        setNow(Date.now());
        setResult({ services: r.services, offers: o.offers, covers, sellers, ratings, categories, errorKey: r.errorKey ?? o.errorKey });
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
      if (!q) return true;
      return [title, seller?.full_name, seller?.handle, seller?.role_title, seller?.city].some((v) => v?.toLowerCase().includes(q));
    };
    return {
      offers: result.offers.filter((o) => ok(o.seller_id, o.service_title)),
      services: result.services.filter((s) => ok(s.seller_id, s.title)),
    };
  }, [result, query, category]);

  // Persone disponibili ora che hanno almeno un servizio prenotabile.
  const nowPeople = useMemo(() => {
    if (!result) return [] as { seller: Seller; service: SlotService }[];
    const seen = new Set<string>();
    const out: { seller: Seller; service: SlotService }[] = [];
    for (const service of result.services) {
      const seller = result.sellers[service.seller_id];
      if (!seller || seen.has(seller.id) || !isAvailableNow(seller, now)) continue;
      if (category && !seller.categories.includes(category)) continue;
      seen.add(seller.id);
      out.push({ seller, service });
    }
    return out;
  }, [result, now, category]);

  if (!result) return <LoadingView />;

  const firstName = (profile?.full_name ?? '').split(/\s+/)[0] ?? '';
  const openSeller = (sellerId: string) => {
    const handle = result.sellers[sellerId]?.handle;
    if (handle) router.push({ pathname: '/u/[handle]', params: { handle } });
  };
  const priceLine = (service: SlotService) =>
    service.kind === 'per_minute' && service.rate_cents_per_min
      ? t('explore.perMin', { price: formatEuro(service.rate_cents_per_min, i18n.language) })
      : service.kind === 'package'
        ? t('book.packageLine', { count: service.sessions ?? 0, minutes: service.duration_min, price: formatEuro(service.price_cents, i18n.language) })
        : `${formatEuro(service.price_cents, i18n.language)} · ${t('explore.minutes', { n: service.duration_min })}`;
  const nothing = filtered.offers.length === 0 && filtered.services.length === 0;

  return (
    <Screen tabs>
      <Text style={[type.title, { color: theme.text }]}>{t('explore.greeting', { name: firstName })}</Text>
      <Text style={[type.body, { color: theme.muted, marginTop: 4 }]}>{t('explore.greetingSub')}</Text>
      <Spacer />
      <TextField label={t('explore.search')} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
        <CategoryPill label={t('explore.allCategories')} selected={category === null} onPress={() => setCategory(null)} />
        {result.categories.map((c) => (
          <CategoryPill key={c.key} label={c.name} emoji={c.emoji} selected={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} />
        ))}
      </ScrollView>
      <Spacer />

      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}

      {nowPeople.length > 0 ? (
        <>
          <Text style={[type.section, { color: theme.text }]}>{t('explore.nowTitle')}</Text>
          <Spacer size={12} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tilesRow}>
            {nowPeople.map(({ seller, service }) => (
              <Pressable
                key={seller.id}
                accessibilityRole="button"
                onPress={() => openSeller(seller.id)}
                style={[styles.tile, { backgroundColor: pastelFor(seller.id) }]}>
                <Avatar name={seller.full_name} seed={seller.id} size={52} uri={null} />
                <Text numberOfLines={1} style={[styles.tileName, { color: theme.ink }]}>{seller.full_name}</Text>
                <Text numberOfLines={1} style={[styles.tileRole, { color: theme.ink }]}>{seller.role_title ?? ''}</Text>
                <Pill label={priceLine(service)} tone="dark" />
              </Pressable>
            ))}
          </ScrollView>
          <Spacer />
        </>
      ) : null}

      <Text style={[type.section, { color: theme.text }]}>{t('explore.forYou')}</Text>
      <Spacer size={12} />
      {!result.errorKey && nothing ? <Body muted>{result.services.length === 0 && result.offers.length === 0 ? t('book.noServices') : t('explore.noResults')}</Body> : null}

      {filtered.offers.map((offer) => {
        const seller = result.sellers[offer.seller_id];
        const live = isAvailableNow(seller, now);
        return (
          <Card key={offer.id}>
            <MediaGallery items={result.covers[offer.service_id] ? [result.covers[offer.service_id]] : []} bucket="service-media" size="small" />
            <View style={styles.row}>
              <Pill label={`−${offer.discount_pct}%`} tone="accent" />
              {live ? <Pill label={t('explore.availableNow')} tone="accent" dot /> : null}
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{offer.service_title}</Text>
            {seller ? <Text style={[type.small, { color: theme.muted }]}>{t('explore.by', { name: seller.full_name })}</Text> : null}
            <Text style={[type.small, { color: theme.muted }]}>
              {formatEuro(finalPriceCents(offer), i18n.language)} · {t('explore.minutes', { n: offer.duration_min })} · {validityText(offer.validity, i18n.language, t)}
            </Text>
            {offer.message ? <Body muted>{offer.message}</Body> : null}
            <Spacer size={12} />
            {seller?.handle ? <Button title={t('explore.viewProfile')} variant="ghost" onPress={() => openSeller(offer.seller_id)} /> : null}
            <Spacer size={8} />
            {live ? (
              <>
                <Button title={t('book.instantNow')} variant="accent" onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id, instant: '1' } })} />
                <Spacer size={8} />
              </>
            ) : null}
            <Button title={t('book.choose')} variant={live ? 'ghost' : 'primary'} onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id } })} />
          </Card>
        );
      })}

      {filtered.services.map((service) => {
        const seller = result.sellers[service.seller_id];
        const live = isAvailableNow(seller, now);
        const rating = result.ratings[service.id];
        return (
          <Card key={service.id}>
            <MediaGallery items={result.covers[service.id] ? [result.covers[service.id]] : []} bucket="service-media" size="small" />
            <View style={styles.row}>
              {live ? <Pill label={t('explore.availableNow')} tone="accent" dot /> : null}
              <Pill label={rating?.rating_avg ? `★ ${Number(rating.rating_avg).toFixed(1)} ${t('explore.reviewsCount', { count: rating.reviews_count })}` : t('explore.noRating')} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{service.title}</Text>
            {seller ? (
              <Pressable accessibilityRole="button" onPress={() => openSeller(service.seller_id)} style={styles.byline}>
                <Avatar name={seller.full_name} seed={seller.id} size={24} uri={null} />
                <Text style={[type.small, { color: theme.muted }]}>{seller.full_name}</Text>
              </Pressable>
            ) : null}
            <Text style={[type.small, { color: theme.muted }]}>{priceLine(service)}</Text>
            <Spacer size={12} />
            <Button title={t('publicProfile.details')} variant="ghost" onPress={() => router.push({ pathname: '/service/[id]', params: { id: service.id } })} />
            <Spacer size={8} />
            {service.kind === 'slot' && live ? (
              <>
                <Button title={t('book.instantNow')} variant="accent" onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id, instant: '1' } })} />
                <Spacer size={8} />
              </>
            ) : null}
            <Button title={t('book.choose')} variant={service.kind === 'slot' && live ? 'ghost' : 'primary'} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />
          </Card>
        );
      })}
    </Screen>
  );
}

function CategoryPill({ label, emoji, selected, onPress }: { label: string; emoji?: string | null; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.catPill, { backgroundColor: selected ? theme.ink : theme.surface }]}>
      {emoji ? <Emoji name={emoji} size={22} /> : null}
      <Text style={[styles.catText, { color: selected ? theme.inkOn : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillsRow: { gap: 8, paddingVertical: 12 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill },
  catText: { fontFamily: fonts.semibold, fontSize: 15 },
  tilesRow: { gap: 12 },
  tile: { width: 168, borderRadius: radius.tile, padding: 14, gap: 6 },
  tileName: { fontFamily: fonts.semibold, fontSize: 17, marginTop: 6 },
  tileRole: { fontFamily: fonts.medium, fontSize: 13, opacity: 0.7 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: -0.3, marginTop: 8 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
});
