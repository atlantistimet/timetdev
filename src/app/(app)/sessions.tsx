import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, CardButton, Chip, ChipRow, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, listMyBookings, type MyBooking } from '@/lib/booking';
import { listMyLinks, type SlotLink } from '@/lib/slot-links';

type Tab = 'booked' | 'received' | 'links';

/** Storico di tutte le sessioni: prenotate da me, ricevute come venditore, slot inviati (anche scaduti). */
export default function SessionsScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [links, setLinks] = useState<SlotLink[]>([]);
  const [tab, setTab] = useState<Tab>('booked');

  useEffect(() => {
    if (!me) return;
    let alive = true;
    (async () => {
      const [b, l] = await Promise.all([listMyBookings(), listMyLinks(me)]);
      if (!alive) return;
      setBookings(b.bookings);
      setLinks(l.links);
    })();
    return () => {
      alive = false;
    };
  }, [me]);

  const list = useMemo(() => (bookings ?? []).filter((b) => (tab === 'booked' ? b.client_id === me : b.seller_id === me)), [bookings, tab, me]);
  if (!bookings) return <LoadingView />;

  const fmtDate = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Screen>
      <Title>{t('sessions.title')}</Title>
      <Spacer size={8} />
      <ChipRow>
        <Chip label={t('sessions.booked')} selected={tab === 'booked'} onPress={() => setTab('booked')} />
        <Chip label={t('sessions.received')} selected={tab === 'received'} onPress={() => setTab('received')} />
        <Chip label={t('sessions.links')} selected={tab === 'links'} onPress={() => setTab('links')} />
      </ChipRow>
      <Spacer size={8} />
      {tab === 'links' ? (
        <>
          {links.length === 0 ? <Body muted>{t('slotLinks.empty')}</Body> : null}
          {links.map((l) => (
            <CardButton
              key={l.id}
              title={l.service_title ?? ''}
              subtitle={`${l.starts_at ? fmtDate.format(new Date(l.starts_at)) : l.days.join(', ')} · ${formatEuro(l.price_cents, i18n.language)}`}
              onPress={() => router.push('/slot-links')}
            />
          ))}
        </>
      ) : (
        <>
          {list.length === 0 ? <Body muted>{t('bookings.empty')}</Body> : null}
          {list.map((b) => (
            <CardButton
              key={b.id}
              title={b.service_title}
              subtitle={`${fmtDate.format(new Date(b.starts_at))} · ${t(`bookings.status.${b.status}`)} · ${tab === 'booked' ? b.seller_name : b.client_name}`}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: b.id } })}
            />
          ))}
        </>
      )}
      <Spacer />
      <Button title={t('common.back')} variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
    </Screen>
  );
}
