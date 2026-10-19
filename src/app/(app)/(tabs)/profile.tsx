import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, CardButton, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadMyProfile } from '@/lib/profile-edit';
import { languageNames, supportedLanguages } from '@/i18n';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { profile, session, signOut, setLanguage } = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const p = await loadMyProfile(userId);
      if (alive) setHandle(p?.handle ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <Screen tabs>
      <Title>{profile?.full_name || t('tabs.profile')}</Title>
      <Body muted>{t('home.signedInAs', { email: session?.user.email })}</Body>
      <Spacer size={20} />
      <CardButton
        title={t('publicProfile.mine')}
        subtitle={handle ? `@${handle}` : t('publicProfile.needHandle')}
        onPress={() => (handle ? router.push({ pathname: '/u/[handle]', params: { handle } }) : router.push('/profile-edit'))}
      />
      <CardButton title={t('chat.title')} subtitle={t('chat.hint')} onPress={() => router.push('/messages')} />
      <CardButton title={t('home.sellerArea')} subtitle={t('home.sellerHint')} onPress={() => router.push('/seller')} />
      <Card>
        <Body>{t('settings.language')}</Body>
        <Spacer size={8} />
        <View style={styles.languages}>
          {supportedLanguages.map((lang) => (
            <View key={lang} style={styles.languageButton}>
              <Button
                title={languageNames[lang] ?? lang}
                variant={i18n.language === lang ? 'primary' : 'ghost'}
                onPress={() => void setLanguage(lang)}
              />
            </View>
          ))}
        </View>
      </Card>
      <Spacer size={8} />
      <Button title={t('settings.signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: 12 },
  languageButton: { flex: 1 },
});
