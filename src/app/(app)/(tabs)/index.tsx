import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, CardButton, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { t } = useTranslation();
  const { profile, session } = useAuth();

  return (
    <Screen tabs>
      <Title>{t('home.greeting', { name: profile?.full_name || session?.user.email })}</Title>
      <Body muted>{t('home.subtitle')}</Body>
      <Spacer size={20} />
      <CardButton title={t('home.servicesLink')} subtitle={t('home.servicesHint')} onPress={() => router.push('/services')} />
      <CardButton title={t('home.bookingsLink')} subtitle={t('home.bookingsHint')} onPress={() => router.push('/bookings')} />
      <CardButton title={t('home.sellerArea')} subtitle={t('home.sellerHint')} onPress={() => router.push('/seller')} />
    </Screen>
  );
}
