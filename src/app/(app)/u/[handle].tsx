import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Chip, ChipRow, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { PhotoStrip } from '@/components/PhotosSection';
import { useAuth } from '@/lib/auth';
import { formatEuro, listSellerServices, type SlotService } from '@/lib/booking';
import { finalPriceCents, listSellerOffers, validityText, type Offer } from '@/lib/offers';
import { initials, loadProfileByHandle, type PublicProfile } from '@/lib/public-profile';
import { listCovers } from '@/lib/service-media';
import { useTheme } from '@/theme';

type Loaded = { profile: PublicProfile; services: SlotService[]; offers: Offer[]; covers: Record<string, string> } | 'missing';

export default function PublicProfileScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<'services' | 'offers'>('services');

  useEffect(() => {
    let alive = true;
    (async () => {
      const profile = handle ? await loadProfileByHandle(handle) : null;
      let result: Loaded = 'missing';
      if (profile) {
        const [services, offers] = await Promise.all([listSellerServices(profile.id), listSellerOffers(profile.id)]);
        const covers = await listCovers(services.map((s) => s.id));
        result = { profile, services, offers, covers };
      }
      if (alive) setLoaded(result);
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  if (!loaded) return <LoadingView />;
  if (loaded === 'missing') {
    return (
      <Screen>
        <Title>{t('publicProfile.notFound')}</Title>
        <Spacer />
        <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/services')} />
      </Screen>
    );
  }

  const { profile, services, offers, covers } = loaded;
  const mine = session?.user.id === profile.id;
  const where = [...new Set(services.flatMap((s) => s.places))];

  return (
    <Screen>
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Text style={[styles.avatarText, { color: theme.onPrimary }]}>{initials(profile.full_name)}</Text>
        </View>
        <Title>{profile.full_name}</Title>
        {profile.handle ? <Body muted>@{profile.handle}</Body> : null}
        {profile.role_title ? <Body>{profile.role_title}</Body> : null}
        {profile.city ? <Body muted>{profile.city}</Body> : null}
        {profile.bio ? <Body muted>{profile.bio}</Body> : null}
      </View>
      {where.length > 0 ? (
        <ChipRow>
          {where.map((p) => (
            <Chip key={p} label={p === 'sede' && profile.place_type ? profile.place_type : t(`places.${p}`)} selected={false} onPress={() => {}} />
          ))}
        </ChipRow>
      ) : null}
      {mine ? <Button title={t('publicProfile.editMine')} variant="ghost" onPress={() => router.push('/profile-edit')} /> : null}
      <Spacer size={8} />
      <ChipRow>
        <Chip label={`${t('publicProfile.services')} (${services.length})`} selected={tab === 'services'} onPress={() => setTab('services')} />
        <Chip label={`${t('publicProfile.offers')} (${offers.length})`} selected={tab === 'offers'} onPress={() => setTab('offers')} />
      </ChipRow>

      {tab === 'services' ? (
        <>
          {services.length === 0 ? <Body muted>{t('publicProfile.noServices')}</Body> : null}
          {services.map((service) => (
            <Card key={service.id}>
              <PhotoStrip paths={covers[service.id] ? [covers[service.id]] : []} />
              <Body>{service.title}</Body>
              <Body muted>
                {formatEuro(service.price_cents, i18n.language)} · {service.duration_min} min · {service.places.map((p) => t(`places.${p}`)).join(', ')}
              </Body>
              <Spacer size={8} />
              <Button title={t('publicProfile.details')} variant="ghost" onPress={() => router.push({ pathname: '/service/[id]', params: { id: service.id } })} />
              {!mine ? (
                <>
                  <Spacer size={8} />
                  <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: service.id } })} />
                </>
              ) : null}
            </Card>
          ))}
        </>
      ) : (
        <>
          {offers.length === 0 ? <Body muted>{t('publicProfile.noOffers')}</Body> : null}
          {offers.map((offer) => (
            <Card key={offer.id}>
              <Body>
                {offer.service_title}
                {offer.discount_pct ? ` · −${offer.discount_pct}%` : ''}
              </Body>
              <Body muted>
                {formatEuro(finalPriceCents(offer), i18n.language)} · {offer.duration_min} min
              </Body>
              <Body muted>{validityText(offer.validity, i18n.language, t)}</Body>
              {offer.message ? <Body muted>{offer.message}</Body> : null}
              {!mine ? (
                <>
                  <Spacer size={8} />
                  <Button title={t('book.choose')} onPress={() => router.push({ pathname: '/book', params: { serviceId: offer.service_id, offerId: offer.id } })} />
                </>
              ) : null}
            </Card>
          ))}
        </>
      )}
      <Spacer size={8} />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/services'))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 2, marginBottom: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontSize: 26, fontWeight: '800' },
});
