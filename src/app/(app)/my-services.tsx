import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '@/components/Pressable';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { DeleteButton } from '@/components/DeleteButton';
import { ErrorText, LoadingView, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listSpecificIds } from '@/lib/availability';
import { formatEuro } from '@/lib/booking';
import { countFutureBookings, deleteService, listMyServices, listPastServices, loadMonthCounts, type MonthCounts, type MyService } from '@/lib/my-services';
import { deleteOffer, finalPriceCents, listMyOffers, listPastOffers, validityText, type Offer } from '@/lib/offers';
import { deleteLink, linkUrl, listMyLinks, listPastLinks, shareText, type SlotLink } from '@/lib/slot-links';
import { dayLabel } from '@/lib/time';
import { discountedCents } from '@/lib/validity';
import { fonts, pastelFor, useTheme } from '@/theme';

type Tab = 'services' | 'offers' | 'links';
type Loaded = {
  services: MyService[];
  pastServices: MyService[];
  offers: Offer[];
  pastOffers: Offer[];
  links: SlotLink[];
  pastLinks: SlotLink[];
  counts: MonthCounts;
  specific: { services: Set<string>; offers: Set<string> };
  errorKey: string | null;
};
type Target = { tab: Tab; id: string } | null;

export default function MyServicesScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<Tab>('services');
  const [menu, setMenu] = useState<Target>(null);
  const [showPast, setShowPast] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [s, pastS, o, pastO, l, pastL, counts, ids] = await Promise.all([
        listMyServices(userId, ['slot', 'package', 'per_minute']),
        listPastServices(userId),
        listMyOffers(userId),
        listPastOffers(userId),
        listMyLinks(userId),
        listPastLinks(userId),
        loadMonthCounts(userId),
        listSpecificIds(userId),
      ]);
      if (active) {
        setLoaded({
          services: s.services,
          pastServices: pastS,
          offers: o.offers,
          pastOffers: pastO,
          links: l.links,
          pastLinks: pastL,
          counts,
          specific: { services: ids.services, offers: ids.offers },
          errorKey: s.errorKey ?? o.errorKey ?? l.errorKey,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  if (!loaded) return <LoadingView />;

  const money = (c: number) => formatEuro(c, i18n.language);
  const reload = () => {
    setMenu(null);
    setReloadKey((k) => k + 1);
  };
  const dateOf = (iso: string | null) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso ?? 0));

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'services', label: t('myServices.tabServices'), n: loaded.services.length },
    { key: 'offers', label: t('myServices.tabOffers'), n: loaded.offers.length },
    { key: 'links', label: t('myServices.tabLinks'), n: loaded.links.length },
  ];

  const row = (key: string, icon: keyof typeof Ionicons.glyphMap, seed: string, title: string, sub: string, stat: string | null, price: string, onMenu: () => void, faded?: boolean) => (
    <View key={key} style={[styles.card, { backgroundColor: theme.surface, opacity: faded ? 0.6 : 1 }]}>
      <View style={[styles.tile, { backgroundColor: pastelFor(seed) }]}>
        <Ionicons name={icon} size={28} color={theme.ink} />
      </View>
      <View style={styles.mid}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.sub, { color: theme.muted }]}>{sub}</Text>
        {stat ? <Text style={[styles.stat, { color: theme.success }]}>{stat}</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={[styles.price, { color: theme.text }]}>{price}</Text>
        {faded ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('myServices.actions', { name: title })} onPress={onMenu} style={[styles.dots, { backgroundColor: theme.bg }]}>
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.ink} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const serviceRow = (s: MyService, faded?: boolean) => {
    const kindIcon: keyof typeof Ionicons.glyphMap = s.kind === 'per_minute' ? 'stopwatch-outline' : s.kind === 'package' ? 'sparkles-outline' : 'calendar-outline';
    const sub =
      s.kind === 'per_minute'
        ? t('myServices.minutesRange', { min: 5, max: 60 })
        : s.kind === 'package'
          ? t('book.packageLine', { count: s.sessions ?? 0, minutes: s.duration_min, price: money(s.price_cents) }).split(' · ')[0]
          : `${s.duration_min} min`;
    const n = s.kind === 'package' ? (loaded.counts.packages[s.id] ?? 0) : (loaded.counts.services[s.id] ?? 0);
    const stat = faded ? t('delete.deletedOn', { date: dateOf(s.deleted_at ?? null) }) : n > 0 ? t(s.kind === 'package' ? 'myServices.statPackages' : s.kind === 'per_minute' ? 'myServices.statCalls' : 'myServices.statBookings', { count: n }) : s.active ? null : t('myServices.paused');
    const price = s.kind === 'per_minute' ? `${money(s.rate_cents_per_min ?? 0)}/min` : money(s.price_cents);
    return row(s.id, kindIcon, s.id, s.title, loaded.specific.services.has(s.id) ? `${sub} · ${t('availability.specificTag')}` : sub, stat, price, () => setMenu({ tab: 'services', id: s.id }), faded);
  };

  const offerRow = (o: Offer, faded?: boolean) =>
    row(o.id, 'pricetag-outline', o.id, o.service_title, validityText(o.validity, i18n.language, t), faded ? t('delete.deletedOn', { date: dateOf(o.deleted_at ?? null) }) : (loaded.counts.offers[o.id] ?? 0) > 0 ? t('myServices.statBookings', { count: loaded.counts.offers[o.id] }) : o.active ? null : t('offers.paused'), `${o.discount_pct ? `−${o.discount_pct}% · ` : ''}${money(finalPriceCents(o))}`, () => setMenu({ tab: 'offers', id: o.id }), faded);

  const linkRow = (l: SlotLink, faded?: boolean) => {
    const when = l.starts_at
      ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(l.starts_at))
      : l.days.map((d) => dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric' })).join(' · ');
    return row(l.id, 'paper-plane-outline', l.id, l.service_title || t('slotLinks.link'), `${l.duration_min} min · ${when}`, faded ? t('delete.deletedOn', { date: dateOf(l.deleted_at ?? null) }) : (loaded.counts.links[l.id] ?? 0) > 0 ? t('myServices.statBookings', { count: loaded.counts.links[l.id] }) : null, money(discountedCents(l.price_cents, l.discount_pct)), () => setMenu({ tab: 'links', id: l.id }), faded);
  };

  const current = tab === 'services' ? loaded.services : tab === 'offers' ? loaded.offers : loaded.links;
  const past = tab === 'services' ? loaded.pastServices : tab === 'offers' ? loaded.pastOffers : loaded.pastLinks;
  const emptyKey = tab === 'services' ? 'myServices.empty' : tab === 'offers' ? 'offers.empty' : 'slotLinks.empty';

  const target = menu;
  const service = target?.tab === 'services' ? loaded.services.find((s) => s.id === target.id) : undefined;
  const offer = target?.tab === 'offers' ? loaded.offers.find((o) => o.id === target.id) : undefined;
  const link = target?.tab === 'links' ? loaded.links.find((l) => l.id === target.id) : undefined;

  const action = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress} style={[styles.act, { backgroundColor: theme.surface }]}>
      <Ionicons name={icon} size={22} color={theme.ink} />
      <Text style={[styles.actText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen
      back
      footer={
        <View style={styles.foot}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/offer-edit')} style={[styles.footBtn, { backgroundColor: theme.surface }]}>
            <Text style={[styles.footText, { color: theme.text }]}>{t('myServices.newOffer')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/slot-link-edit')} style={[styles.footBtn, { backgroundColor: theme.ink }]}>
            <Text style={[styles.footText, { color: '#FFFFFF' }]}>{t('myServices.newSlot')}</Text>
          </Pressable>
        </View>
      }>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>{t('myServices.title')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('myServices.new')} onPress={() => router.push('/service-edit')} style={[styles.plus, { backgroundColor: theme.ink }]}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
        {tabs.map((x) => (
          <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: tab === x.key }} onPress={() => { setTab(x.key); setShowPast(false); }} style={[styles.tab, tab === x.key && { backgroundColor: theme.ink }]}>
            <Text style={[styles.tabText, { color: tab === x.key ? '#FFFFFF' : theme.text, fontFamily: tab === x.key ? fonts.semibold : fonts.medium }]}>{`${x.label} · ${x.n}`}</Text>
          </Pressable>
        ))}
      </View>
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {note ? <Text style={[styles.sub, { color: theme.muted, paddingHorizontal: 4 }]}>{note}</Text> : null}
      <View style={styles.list}>
        {current.length === 0 && !loaded.errorKey ? <Text style={[styles.empty, { color: theme.muted }]}>{t(emptyKey)}</Text> : null}
        {tab === 'services' ? loaded.services.map((s) => serviceRow(s)) : tab === 'offers' ? loaded.offers.map((o) => offerRow(o)) : loaded.links.map((l) => linkRow(l))}
        {past.length > 0 ? (
          <>
            <Pressable accessibilityRole="button" onPress={() => setShowPast((v) => !v)} style={[styles.pastRow, { borderColor: theme.muted }]}>
              <Text style={[styles.name, { color: theme.text, fontSize: 15 }]}>{t('myServices.pastCount', { count: past.length })}</Text>
              <Ionicons name={showPast ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.ink} />
            </Pressable>
            {showPast ? (tab === 'services' ? loaded.pastServices.map((s) => serviceRow(s, true)) : tab === 'offers' ? loaded.pastOffers.map((o) => offerRow(o, true)) : loaded.pastLinks.map((l) => linkRow(l, true))) : null}
          </>
        ) : null}
      </View>

      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setMenu(null)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.scrim }]} onPress={() => setMenu(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
          <View style={[styles.grab, { backgroundColor: theme.fill }]} />
          <Text numberOfLines={1} style={[styles.sheetTitle, { color: theme.text }]}>{service?.title ?? offer?.service_title ?? link?.service_title ?? ''}</Text>
          {service ? (
            <>
              {action('create-outline', t('myServices.edit'), () => { setMenu(null); router.push({ pathname: '/service-edit', params: { id: service.id } }); })}
              {service.kind === 'slot' ? action('pricetag-outline', t('myServices.createOffer'), () => { setMenu(null); router.push({ pathname: '/offer-edit', params: { serviceId: service.id } }); }) : null}
              <DeleteButton label={t('myServices.delete')} warning={t('myServices.deleteWarning')} loadCount={() => countFutureBookings('service_id', service.id)} onConfirm={async () => { await deleteService(service.id); reload(); }} />
            </>
          ) : null}
          {offer ? (
            <>
              {action('create-outline', t('offers.edit'), () => { setMenu(null); router.push({ pathname: '/offer-edit', params: { id: offer.id } }); })}
              <DeleteButton label={t('offers.delete')} warning={t('offers.deleteWarning')} loadCount={() => countFutureBookings('offer_id', offer.id)} onConfirm={async () => { await deleteOffer(offer.id); reload(); }} />
            </>
          ) : null}
          {link ? (
            <>
              {action('share-outline', t('slotLinks.share'), () => {
                setMenu(null);
                void shareText(`${link.message ? `${link.message}\n` : ''}${linkUrl(link.code)}`).then((r) => setNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null));
              })}
              <DeleteButton label={t('slotLinks.delete')} warning={t('slotLinks.deleteWarning')} loadCount={() => countFutureBookings('slot_link_id', link.id)} onConfirm={async () => { await deleteLink(link.id); reload(); }} />
            </>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.semibold, fontSize: 34, letterSpacing: -1.4 },
  plus: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 999, marginBottom: 12 },
  tab: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  list: { gap: 12 },
  card: { borderRadius: 30, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  sub: { fontFamily: fonts.regular, fontSize: 13 },
  stat: { fontFamily: fonts.semibold, fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 6 },
  price: { fontFamily: fonts.semibold, fontSize: 18 },
  dots: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  pastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed' },
  foot: { flexDirection: 'row', gap: 8 },
  footBtn: { flex: 1, height: 58, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  footText: { fontFamily: fonts.semibold, fontSize: 16 },
  backdrop: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 16, paddingBottom: 34, gap: 10 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  sheetTitle: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.5 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 999, paddingHorizontal: 20 },
  actText: { fontFamily: fonts.semibold, fontSize: 16 },
});
