import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Body, Button, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { languageNames, supportedLanguages } from '@/i18n';

export default function Home() {
  const { t, i18n } = useTranslation();
  const { profile, session, signOut, setLanguage } = useAuth();

  return (
    <Screen>
      <Title>{t('home.greeting', { name: profile?.full_name || session?.user.email })}</Title>
      <Body muted>{t('home.subtitle')}</Body>
      <Spacer size={8} />
      <Body muted>{t('home.signedInAs', { email: session?.user.email })}</Body>
      <Spacer size={32} />
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
      <Spacer size={32} />
      <Button title={t('settings.signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: 12 },
  languageButton: { flex: 1 },
});
