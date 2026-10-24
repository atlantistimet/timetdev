import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, listMyBookings, markBookingOutcome, type MyBooking } from '@/lib/booking';
import { ReviewForm } from '@/components/ReviewForm';
import { reviewedBookingIds } from '@/lib/reviews';
import { cancelBooking, previewCancel, type CancelPreview } from '@/lib/cancel-policy';

export default function BookingsScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [now, setNow] = useState(0); // aggiornato a ogni caricamento, così il render resta puro
  const [previews, setPreviews] = useState<Record<string, CancelPreview>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [reloadKey, setReloadKey] = useState(0);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'upcoming' | 'received' | 'past'>('upcoming');

  useEffect(() => {
    let active = true;
    (async () => {
      const [r, done] = await Promise.all([listMyBookings(), userId ? reviewedBookingIds(userId) : Promise.resolve(new Set<string>())]);
      if (!active) return;
      setReviewed(done);
      setBookings(r.bookings);
      setListError(r.errorKey);
      setNow(Date.now());
    })();
    return () => {
      active = false;
    };
  }, [reloadKey, userId]);

  const shown = useMemo(() => {
    const list = bookings ?? [];
    const upcoming = (b: MyBooking) => b.status === 'confirmed' && new Date(b.ends_at).getTime() > now;
    if (tab === 'past') return list.filter((b) => !upcoming(b));
    const open = list.filter(upcoming).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return tab === 'received' ? list.filter((b) => b.seller_id === userId && b.status === 'confirmed').sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : open;
  }, [bookings, tab, now, userId]);

  if (!bookings) return <LoadingView />;

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' });
  const setError = (id: string, key: string | null) =>
    setErrors((current) => {
      const next = { ...current };
      if (key) next[id] = key;
      else delete next[id];
      return next;
    });

  const askCancel = async (id: string) => {
    setBusyId(id);
    setError(id, null);
    const { data, errorKey } = await previewCancel(id);
    setBusyId(null);
    if (data) setPreviews((current) => ({ ...current, [id]: data }));
    else setError(id, errorKey);
  };

  const outcome = async (id: string, value: 'completed' | 'no_show') => {
    setBusyId(id);
    const errorKey = await markBookingOutcome(id, value);
    setBusyId(null);
    if (errorKey) setError(id, errorKey);
    else setReloadKey((key) => key + 1);
  };

  const confirmCancel = async (id: string) => {
    setBusyId(id);
    const { errorKey } = await cancelBooking(id);
    setBusyId(null);
    if (errorKey) {
      setError(id, errorKey);
      return;
    }
    setPreviews((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setReloadKey((key) => key + 1);
  };

  return (
    <Screen tabs>
      <Title>{t('bookings.title')}</Title>
      <Spacer />
      {listError ? <ErrorText>{t(listError)}</ErrorText> : null}
      <ChipRow>
        <Chip label={t('bookings.tabUpcoming')} selected={tab === 'upcoming'} onPress={() => setTab('upcoming')} />
        <Chip label={t('bookings.tabReceived')} selected={tab === 'received'} onPress={() => setTab('received')} />
        <Chip label={t('bookings.tabPast')} selected={tab === 'past'} onPress={() => setTab('past')} />
      </ChipRow>
      <Spacer size={8} />
      {!listError && shown.length === 0 ? <Body muted>{t('bookings.empty')}</Body> : null}
      {shown.map((booking) => {
        const mine = booking.client_id === userId;
        const preview = previews[booking.id];
        const future = new Date(booking.starts_at).getTime() > now;
        return (
          <Card key={booking.id}>
            <Body>{booking.service_title}</Body>
            <Button title={t('sessions.open')} variant="ghost" onPress={() => router.push({ pathname: '/session/[id]', params: { id: booking.id } })} />
            <Body muted>{dateFormat.format(new Date(booking.starts_at))}</Body>
            <Body muted>
              {t(mine ? 'bookings.withSeller' : 'bookings.fromClient', { name: (mine ? booking.seller_name : booking.client_name) ?? '—' })}
            </Body>
            <Body muted>
              {t(`bookings.place.${booking.place}`)}
              {booking.place === 'domicilio' && booking.client_address ? ` · ${booking.client_address}` : ''}
              {' · '}
              {formatEuro(booking.price_cents + booking.extra_cents, i18n.language)}
            </Body>
            <Body muted>
              {t(mine ? 'bookings.roleClient' : 'bookings.roleSeller')} · {t(`bookings.status.${booking.status}`)}
              {booking.status === 'cancelled' && booking.refund_cents > 0
                ? ` · ${t('bookings.refunded', { amount: formatEuro(booking.refund_cents, i18n.language) })}`
                : ''}
            </Body>
            {errors[booking.id] ? <ErrorText>{t(errors[booking.id])}</ErrorText> : null}
            {booking.status === 'completed' && mine && userId ? (
              reviewed.has(booking.id) ? (
                <Body muted>{t('reviews.thanks')}</Body>
              ) : (
                <>
                  <Spacer size={8} />
                  <ReviewForm bookingId={booking.id} authorId={userId} sellerId={booking.seller_id} onDone={() => setReloadKey((k) => k + 1)} />
                </>
              )
            ) : null}
            {booking.status === 'confirmed' && !mine && new Date(booking.ends_at).getTime() <= now ? (
              <>
                <Spacer size={8} />
                <Body>{t('bookings.outcomeQuestion')}</Body>
                <Spacer size={8} />
                <Button title={t('bookings.markCompleted')} onPress={() => void outcome(booking.id, 'completed')} loading={busyId === booking.id} />
                <Spacer size={8} />
                <Button title={t('bookings.markNoShow')} variant="ghost" onPress={() => void outcome(booking.id, 'no_show')} loading={busyId === booking.id} />
                <Body muted>{t('bookings.noShowHint')}</Body>
              </>
            ) : null}
            {booking.status === 'confirmed' && future ? (
              preview ? (
                <>
                  <Spacer size={8} />
                  <Body>
                    {preview.paid
                      ? t('bookings.refundPreview', { amount: formatEuro(preview.refund_cents, i18n.language), pct: preview.refund_pct })
                      : t('bookings.noPayment')}
                  </Body>
                  <Spacer size={8} />
                  <Button title={t('bookings.confirmCancel')} onPress={() => void confirmCancel(booking.id)} loading={busyId === booking.id} />
                  <Spacer size={8} />
                  <Button
                    title={t('bookings.keep')}
                    variant="ghost"
                    onPress={() => setPreviews((current) => {
                      const next = { ...current };
                      delete next[booking.id];
                      return next;
                    })}
                  />
                </>
              ) : (
                <>
                  <Spacer size={8} />
                  <Button title={t('bookings.cancel')} variant="ghost" onPress={() => void askCancel(booking.id)} loading={busyId === booking.id} />
                </>
              )
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
