import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/Pressable';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { ServiceCard } from '@/components/ServiceCard';
import { Emoji } from '@/components/Emoji';
import { Body, Button, Chip, ChipRow, ErrorText, LoadingView, Pill, Screen, Spacer } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { cleanTitle, formatEuro, isTimed, listSlotServices, type SlotService } from '@/lib/booking';
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
import { finalPriceCents, listPublicOffers, type Offer } from '@/lib/offers';
import { loadBlockedIds } from '@/lib/safety';
import { listCovers } from '@/lib/service-media';
import { type Place } from '@/lib/my-services';
import { fonts, pastelFor, radius, type, useTheme } from '@/theme';

type KindKey = 'blocks' | 'timed' | 'package';
type PriceBand = 'lt25' | '25-50' | '50-100' | 'gt100';
type DurBand = 'le30' | '45' | '60' | 'ge90';
const inBand = (cents: number, b: PriceBand) => (b === 'lt25' ? cents < 2500 : b === '25-50' ? cents >= 2500 && cents < 5000 : b === '50-100' ? cents >= 5000 && cents < 10000 : cents >= 10000);
const inDur = (m: number, b: DurBand) => (b === 'le30' ? m <= 30 : b === '45' ? m > 30 && m <= 45 : b === '60' ? m > 45 && m < 90 : m >= 90);

type Data = {
  services: SlotService[];
  offers: Offer[];
  covers: Record<string, MediaItem>;
  sellers: Record<string, Seller>;
  ratings: Record<string, ServiceRating>;
  categories: Category[];
  blocked: Set<string>;
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
  const [onlyNow, setOnlyNow] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [onlyDiscount, setOnlyDiscount] = useState(false);
  const [kinds, setKinds] = useState<KindKey[]>([]);
  const [band, setBand] = useState<PriceBand | null>(null);
  const [dur, setDur] = useState<DurBand | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, o, categories, blocked] = await Promise.all([listSlotServices(userId), listPublicOffers(userId), loadCategories(i18n.language), loadBlockedIds()]);
      const [covers, sellers, ratings] = await Promise.all([
        listCovers(r.services.map((x) => x.id)),
        loadSellers([userId, ...r.services.map((x) => x.seller_id), ...o.offers.map((x) => x.seller_id)]),
        loadServiceRatings(r.services.map((x) => x.id)),
      ]);
      if (active) {
        setNow(Date.now());
        setResult({ services: r.services, offers: o.offers, covers, sellers, ratings, categories, blocked, errorKey: r.errorKey ?? o.errorKey });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, i18n.language]);

  const filtered = useMemo(() => {
    if (!result) return { offers: [] as Offer[], services: [] as SlotService[] };
    const q = query.trim().toLowerCase();
    const byId = new Map(result.services.map((x) => [x.id, x]));
    const kindOf = (sv: SlotService | undefined): KindKey => (sv?.kind === 'package' ? 'package' : sv && isTimed(sv) ? 'timed' : 'blocks');
    const ok = (sellerId: string, title: string, serviceId: string, cents: number, minutes: number, discount: boolean) => {
      const seller = result.sellers[sellerId];
      const sv = byId.get(serviceId);
      if (result.blocked.has(sellerId)) return false;
      if (category && !seller?.categories.includes(category)) return false;
      if (onlyNow && !isAvailableNow(seller, now)) return false;
      if (onlyDiscount && !discount) return false;
      if (kinds.length > 0 && !kinds.includes(kindOf(sv))) return false;
      if (band && !inBand(cents, band)) return false;
      if (dur && !inDur(minutes, dur)) return false;
      if (place && !sv?.places.includes(place)) return false;
      if (minRating !== null && Number(result.ratings[serviceId]?.rating_avg ?? 0) < minRating) return false;
      if (!q) return true;
      return [title, seller?.full_name, seller?.handle, seller?.role_title, seller?.city].some((v) => v?.toLowerCase().includes(q));
    };
    return {
      offers: result.offers.filter((o) => ok(o.seller_id, o.service_title, o.service_id, finalPriceCents(o), o.duration_min, o.discount_pct > 0)),
      services: onlyDiscount ? [] : result.services.filter((s) => ok(s.seller_id, s.title, s.id, s.price_cents, s.duration_min, false)),
    };
  }, [result, query, category, onlyNow, now, onlyDiscount, kinds, band, dur, place, minRating]);

  const activeFilters = Number(onlyNow) + Number(onlyDiscount) + kinds.length + Number(band !== null) + Number(dur !== null) + Number(place !== null) + Number(minRating !== null);
  const resetFilters = () => {
    setOnlyNow(false);
    setOnlyDiscount(false);
    setKinds([]);
    setBand(null);
    setDur(null);
    setPlace(null);
    setMinRating(null);
  };

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
        : isTimed(service)
          ? `${t('explore.perHour', { price: formatEuro(service.price_cents, i18n.language) })} · ${t('explore.timedRange', { min: service.duration_min, max: service.max_duration_min ?? service.duration_min })}`
          : `${formatEuro(service.price_cents, i18n.language)} · ${t('explore.minutes', { n: service.duration_min })}`;

  const emojiOf = (sellerId: string) => {
    const key = result.sellers[sellerId]?.categories[0];
    return result.categories.find((c) => c.key === key)?.emoji ?? null;
  };
  const rows = [
    ...filtered.offers.map((o) => ({
      id: `o-${o.id}`,
      sellerId: o.seller_id,
      serviceId: o.service_id,
      title: cleanTitle(o.service_title),
      meta: `${t('explore.minutes', { n: o.duration_min })}`,
      price: formatEuro(finalPriceCents(o), i18n.language),
      badge: o.discount_pct ? `−${o.discount_pct}%` : null,
      durationLabel: t('explore.minutes', { n: o.duration_min }),
      onPress: () => router.push({ pathname: '/book', params: { serviceId: o.service_id, offerId: o.id } }),
    })),
    ...filtered.services.map((s) => ({
      id: `s-${s.id}`,
      sellerId: s.seller_id,
      serviceId: s.id,
      title: cleanTitle(s.title),
      meta: s.kind === 'package' ? t('book.packageShort', { count: s.sessions ?? 0 }) : t('explore.minutes', { n: s.duration_min }),
      price:
        s.kind === 'per_minute' && s.rate_cents_per_min
          ? t('explore.perMin', { price: formatEuro(s.rate_cents_per_min, i18n.language) })
          : formatEuro(s.price_cents, i18n.language),
      badge: null as string | null,
      durationLabel: s.kind === 'package' ? t('book.packageShort', { count: s.sessions ?? 0 }) : isTimed(s) ? t('explore.timedRange', { min: s.duration_min, max: s.max_duration_min ?? s.duration_min }) : t('explore.minutes', { n: s.duration_min }),
      onPress: () => router.push({ pathname: '/service/[id]', params: { id: s.id } }),
    })),
  ];

  return (
    <Screen tabs>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.hello}>
            <Text style={[type.body, { color: theme.muted }]}>{t('explore.greeting', { name: firstName })}</Text>
            <Emoji name="waving_hand" size={20} />
          </View>
          <Text style={[styles.headline, { color: theme.text }]}>{t('explore.greetingSub').replace(' il ', '\nil ')}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('tabs.profile')} onPress={() => router.push('/profile')}>
          <Avatar name={profile?.full_name ?? '?'} size={48} color={theme.initials} path={result.sellers[userId ?? '']?.avatar_path} />
        </Pressable>
      </View>

      <View style={[styles.search, { backgroundColor: theme.surface }]}>
        <Ionicons name="search-outline" size={22} color={theme.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('explore.search')}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('explore.search')}
          style={[styles.searchInput, { color: theme.text }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={t('explore.filters')} onPress={() => setFiltersOpen(true)} style={[styles.filterBtn, { backgroundColor: activeFilters > 0 ? theme.accent : theme.ink }]}>
          <Ionicons name="options-outline" size={22} color={activeFilters > 0 ? theme.onAccent : theme.inkOn} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
        <CategoryPill label={t('explore.allCategories')} selected={category === null} onPress={() => setCategory(null)} />
        {result.categories.map((c) => (
          <CategoryPill key={c.key} label={c.name} emoji={c.emoji} selected={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} />
        ))}
      </ScrollView>

      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}

      {nowPeople.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitle}>
              <View style={[styles.liveDot, { backgroundColor: theme.accent, borderColor: theme.ink }]} />
              <Text style={[type.section, { color: theme.text }]}>{t('explore.nowTitle')}</Text>
            </View>
            <Text style={[type.body, { color: theme.muted }]}>{t('explore.seeAll')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tilesRow}>
            {nowPeople.map(({ seller, service }) => (
              <Pressable key={seller.id} accessibilityRole="button" onPress={() => openSeller(seller.id)} style={[styles.tile, { backgroundColor: pastelFor(seller.id) }]}>
                <View style={styles.tileTop}>
                  <Avatar name={seller.full_name} seed={seller.id} size={60} path={seller.avatar_path} />
                  <View style={styles.tileEmoji}>
                    <Emoji name={result.categories.find((c) => c.key === seller.categories[0])?.emoji} size={20} />
                  </View>
                </View>
                <View style={styles.tileBottom}>
                  <Text numberOfLines={1} style={[styles.tileName, { color: theme.ink }]}>{seller.full_name.split(/\s+/)[0]}</Text>
                  <Text numberOfLines={1} style={[styles.tileRole, { color: theme.ink }]}>{seller.role_title ?? ''}</Text>
                  <Pill label={priceLine(service)} tone="price" />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <Text style={[styles.perTe, type.section, { color: theme.text }]}>{t('explore.forYou')}</Text>
      {!result.errorKey && rows.length === 0 ? <Body muted>{result.services.length === 0 && result.offers.length === 0 ? t('book.noServices') : t('explore.noResults')}</Body> : null}
      <View style={styles.grid}>
        {rows.map((r) => {
          const seller = result.sellers[r.sellerId];
          return (
            <ServiceCard
              key={r.id}
              id={r.serviceId}
              title={r.title}
              price={r.price}
              meta={r.durationLabel}
              cover={result.covers[r.serviceId]}
              emoji={emojiOf(r.sellerId)}
              live={isAvailableNow(seller, now)}
              badge={r.badge}
              liveLabel={t('explore.nowShort')}
              seller={seller ? { id: seller.id, name: seller.full_name, handle: seller.handle, avatar: seller.avatar_path } : null}
              rating={result.ratings[r.serviceId]?.rating_avg}
              onPress={r.onPress}
            />
          );
        })}
      </View>

      <SheetModal visible={filtersOpen}  onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={[styles.scrim]} onPress={() => setFiltersOpen(false)} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View style={styles.sheetHead}>
            <Text style={[type.section, { color: theme.text }]}>{t('explore.filters')}</Text>
            <Pressable accessibilityRole="button" onPress={resetFilters}><Text style={[type.body, { color: theme.muted }]}>{t('explore.reset')}</Text></Pressable>
          </View>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <ChipRow>
              <Chip label={t('explore.onlyNow')} selected={onlyNow} onPress={() => setOnlyNow((v) => !v)} />
              <Chip label={t('explore.onlyDiscount')} selected={onlyDiscount} onPress={() => setOnlyDiscount((v) => !v)} />
            </ChipRow>
            <Text style={[styles.fLabel, { color: theme.muted }]}>{t('explore.fType')}</Text>
            <ChipRow>
              {(['blocks', 'timed', 'package'] as KindKey[]).map((k) => (
                <Chip key={k} label={t(`explore.kind_${k}`)} selected={kinds.includes(k)} onPress={() => setKinds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))} />
              ))}
            </ChipRow>
            <Text style={[styles.fLabel, { color: theme.muted }]}>{t('explore.fPrice')}</Text>
            <ChipRow>
              {(['lt25', '25-50', '50-100', 'gt100'] as PriceBand[]).map((b) => (
                <Chip key={b} label={t(`explore.price_${b}`)} selected={band === b} onPress={() => setBand(band === b ? null : b)} />
              ))}
            </ChipRow>
            <Text style={[styles.fLabel, { color: theme.muted }]}>{t('explore.fDuration')}</Text>
            <ChipRow>
              {(['le30', '45', '60', 'ge90'] as DurBand[]).map((b) => (
                <Chip key={b} label={t(`explore.dur_${b}`)} selected={dur === b} onPress={() => setDur(dur === b ? null : b)} />
              ))}
            </ChipRow>
            <Text style={[styles.fLabel, { color: theme.muted }]}>{t('explore.fPlace')}</Text>
            <ChipRow>
              {(['online', 'sede', 'domicilio'] as Place[]).map((p) => (
                <Chip key={p} label={t(`svc.place_${p}`)} selected={place === p} onPress={() => setPlace(place === p ? null : p)} />
              ))}
            </ChipRow>
            <Text style={[styles.fLabel, { color: theme.muted }]}>{t('explore.fRating')}</Text>
            <ChipRow>
              {[4, 4.5].map((r) => (
                <Chip key={r} label={`★ ${String(r).replace('.', ',')}+`} selected={minRating === r} onPress={() => setMinRating(minRating === r ? null : r)} />
              ))}
            </ChipRow>
          </ScrollView>
          <Spacer />
          <Button title={t('explore.showResults', { count: rows.length })} onPress={() => setFiltersOpen(false)} />
        </View>
      </SheetModal>
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
      {emoji ? <View style={[styles.catIcon, { backgroundColor: theme.fill }]}><Emoji name={emoji} size={20} /></View> : null}
      <Text style={[styles.catText, { color: selected ? theme.inkOn : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  hello: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headline: { ...type.title, marginTop: 6, letterSpacing: -1.44, lineHeight: 37 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, borderRadius: radius.pill, paddingLeft: 18, paddingRight: 8, marginTop: 16 },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 16, minHeight: 44 },
  filterBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pillsRow: { gap: 8, paddingVertical: 16 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingLeft: 6, paddingRight: 16, borderRadius: radius.pill },
  catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catText: { fontFamily: fonts.medium, fontSize: 15, paddingLeft: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  tilesRow: { gap: 10 },
  tile: { width: 152, height: 200, borderRadius: 30, padding: 14, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between' },
  tileEmoji: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  tileBottom: { gap: 2 },
  tileName: { fontFamily: fonts.semibold, fontSize: 18 },
  tileRole: { fontFamily: fonts.medium, fontSize: 13, opacity: 0.75, marginBottom: 6 },
  perTe: { marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.card, padding: 14, marginBottom: 12 },
  rowTile: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2 },
  rowBadge: { flexDirection: 'row', marginTop: 4 },
  rowPrice: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.4 },
  scrim: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetScroll: { maxHeight: 460 },
  fLabel: { fontFamily: fonts.semibold, fontSize: 13, marginTop: 18, marginBottom: 8 },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 24, paddingBottom: 40 },
});
