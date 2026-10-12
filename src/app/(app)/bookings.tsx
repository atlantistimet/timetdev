import { Fragment, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro, listMyBookings, type MyBooking } from '@/lib/booking';
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

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await listMyBookings();
      if (!active) return;
      setBookings(r.bookings);
      setListError(r.errorKey);
      setNow(Date.now());
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

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
    <Screen>
      <Title>{t('bookings.title')}</Title>
      <Spacer />
      {listError ? <ErrorText>{t(listError)}</ErrorText> : null}
      {!listError && bookings.length === 0 ? <Body muted>{t('bookings.empty')}</Body> : null}
      {bookings.map((booking) => {
        const mine = booking.client_id === userId;
        const preview = previews[booking.id];
        const future = new Date(booking.starts_at).getTime() > now;
        return (
          <Fragment key={booking.id}>
            <Spacer size={12} />
            <Body>{booking.service_title}</Body>
            <Body muted>{dateFormat.format(new Date(booking.starts_at))}</Body>
            <Body muted>
              {t(mine ? 'bookings.roleClient' : 'bookings.roleSeller')} · {t(`bookings.status.${booking.status}`)}
              {booking.status === 'cancelled' && booking.refund_cents > 0
                ? ` · ${t('bookings.refunded', { amount: formatEuro(booking.refund_cents, i18n.language) })}`
                : ''}
            </Body>
            {errors[booking.id] ? <ErrorText>{t(errors[booking.id])}</ErrorText> : null}
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
          </Fragment>
        );
      })}
      <Spacer size={24} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
