import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Emoji } from '@/components/Emoji';
import { ServiceHero } from '@/components/ServiceHero';
import { TierRows } from '@/components/TierLines';
import { Group, GroupRow, Section } from '@/components/settings';
import { ActionBar, Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { loadCategories, loadSellerStats, loadSellers, type Seller } from '@/lib/explore';
import { fonts, pastelFor, radius, useTheme } from '@/theme';
import { useAuth } from '@/lib/auth';
import { formatEuro, loadSellerPlace, loadSlotService, type SellerPlace, type SlotService } from '@/lib/booking';
import { loadServiceTiers, type Tier } from '@/lib/cancel-policy';
import { loadProfileById, type PublicProfile } from '@/lib/public-profile';
import { type MediaItem } from '@/lib/media';
import { listPhotos } from '@/lib/service-media';

type Loaded = { service: SlotService; seller: PublicProfile | null; place: SellerPlace; photos: MediaItem[]; tiers: Tier[]; sellerCard: Seller | null; rating: number | null; emoji: string | null } | 'missing';

export default function ServiceDetailScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const service = id ? await loadSlotService(id) : null;
      let result: Loaded = 'missing';
      if (service) {
        const [seller, place, photos, tiers, sellers, stats, categories] = await Promise.all([
          loadProfileById(service.seller_id),
          loadSellerPlace(service.seller_id),
          listPhotos(service.id).then((l) => l.map((x) => ({ path: x.path, type: x.type }))),
          loadServiceTiers(service.seller_id, service.cancel_tiers),
          loadSellers([service.seller_id]),
          loadSellerStats([service.seller_id]),
          loadCategories(i18n.language),
        ]);
        const sellerCard = sellers[service.seller_id] ?? null;
        const emoji = categories.find((c) => c.key === sellerCard?.categories[0])?.emoji ?? null;
        result = { service, seller, place, photos, tiers, sellerCard, rating: stats[service.seller_id]?.rating_avg ?? null, emoji };
      }
      if (alive) {
        setNowMs(Date.now());
        setLoaded(result);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, i18n.language]);

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

  const { service, seller, place, photos, tiers, sellerCard, rating, emoji } = loaded;
  const mine = session?.user.id === service.seller_id;
  // Slot e pacchetti si prenotano nella stessa schermata di scelta della data.
  if (!mine && service.kind !== 'per_minute') return <Redirect href={{ pathname: '/book', params: { serviceId: service.id } }} />;
  const callableNow = !!seller?.available_until && new Date(seller.available_until).getTime() > nowMs;
  const fmt = (cents: number) => formatEuro(cents, i18n.language);
  const rateText = t('explore.perMin', { price: fmt(service.rate_cents_per_min ?? 0) });
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/services'));

  return (
    <Screen
      bare
      footer={
        mine ? undefined : (
          <ActionBar
            label={rateText}
            caption={callableNow ? t('explore.availableNow') : t('calls.notAvailable')}
            actionTitle={t('calls.callNow')}
            disabled={!callableNow}
            onAction={() => router.push({ pathname: '/call-start', params: { serviceId: service.id } })}
          />
        )
      }>
      <ServiceHero
        color={pastelFor(service.id)}
        emoji={emoji}
        title={service.title}
        sellerId={service.seller_id}
        sellerName={sellerCard?.full_name ?? seller?.full_name ?? ''}
        sellerPath={sellerCard?.avatar_path}
        rating={rating ? Number(rating) : null}
        tag={service.kind === 'per_minute' ? rateText : `${service.duration_min} min`}
        onBack={goBack}
        backLabel={t('common.back')}
        imagePath={photos.find((x) => x.type === 'image')?.path}
      />
      <View style={styles.body}>
                {mine ? <ErrorText>{t('serviceDetail.mine')}</ErrorText> : null}
        {service.description ? <Text style={[styles.desc, { color: theme.text }]}>{service.description}</Text> : null}
        {service.includes.length > 0 ? (
          <View style={styles.pills}>
            {service.includes.map((line) => (
              <View key={line} style={[styles.pill, { backgroundColor: theme.surface }]}>
                <Emoji name="sparkles" size={20} />
                <Text style={[styles.pillText, { color: theme.text }]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {service.kind === 'per_minute' ? (
          <Section label={t('calls.howItWorksTitle')}>
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Body muted>{t('calls.howItWorks')}</Body>
            </View>
          </Section>
        ) : (
          <>
            <Section label={t('book.where')}>
              <Group>
                {service.places.map((p) => (
                  <GroupRow
                    key={p}
                    icon={p === 'sede' ? 'storefront-outline' : p === 'domicilio' ? 'home-outline' : 'videocam-outline'}
                    label={t(`places.${p}`)}
                    sub={
                      [
                        p === 'sede' && place.place_address ? place.place_address : null,
                        p === 'sede' && service.space_fee_cents > 0 ? `+${fmt(service.space_fee_cents)}` : null,
                        p === 'domicilio' && place.service_area ? place.service_area : null,
                        p === 'domicilio' && place.travel_fee_cents > 0 ? `+${fmt(place.travel_fee_cents)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  />
                ))}
              </Group>
            </Section>
            <Section label={t('policy.cancelRules')}>
              <TierRows tiers={tiers} />
            </Section>
          </>
        )}
        <Spacer size={4} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 22 },
  desc: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { height: 34, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontFamily: fonts.medium, fontSize: 14 },
  card: { borderRadius: radius.card, padding: 16 },
});
