// Link del QR del check-in: https://timeet.world/checkin/<prenotazione>/<token> (o timeet://checkin/...).
// Chi lo apre dalla fotocamera del telefono arriva qui (da disconnesso passa dal login e torna qui): si prova il check-in e si apre la sessione.
// Il token vale un paio di minuti: se nel frattempo è scaduto, dalla sessione si usa il codice a 6 cifre.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Spacer } from '@/components/ui';
import { checkIn, parseCheckinLink } from '@/lib/checkin';
import { fonts, useTheme } from '@/theme';

export default function CheckinLinkScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { booking, token } = useLocalSearchParams<{ booking: string; token: string }>();
  const link = parseCheckinLink(`checkin/${booking ?? ''}/${token ?? ''}`);
  const [errorKey, setErrorKey] = useState<string | null>(link ? null : 'checkin.errors.not_checkin_qr');

  useEffect(() => {
    if (!link) return;
    let alive = true;
    void checkIn(link.bookingId, { token: link.token }).then((r) => {
      if (!alive) return;
      if (r.checkedInAt || r.errorKey === 'checkin.errors.already_checked_in') router.replace({ pathname: '/session/[id]', params: { id: link.bookingId } });
      else setErrorKey(r.errorKey);
    });
    return () => {
      alive = false;
    };
    // il link si legge una volta sola
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, token]);

  return (
    <Screen>
      <View style={styles.wrap}>
        {errorKey ? (
          <>
            <Text style={[styles.h, { color: theme.text }]}>{t('checkin.linkFailed')}</Text>
            <Text style={[styles.body, { color: theme.muted }]}>{t(errorKey, { name: '' })}</Text>
            <Spacer />
            {link ? <Button title={t('checkin.openSession')} onPress={() => router.replace({ pathname: '/session/[id]', params: { id: link.bookingId } })} /> : null}
            <Spacer size={8} />
            <Button title={t('bookings.backAgenda')} variant="ghost" onPress={() => router.replace('/bookings')} />
          </>
        ) : (
          <>
            <ActivityIndicator color={theme.ink} />
            <Text style={[styles.body, { color: theme.muted }]}>{t('checkin.linkWorking')}</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 80, gap: 12, alignItems: 'stretch' },
  h: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
});
