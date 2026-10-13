import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isValidEmail } from '@/lib/auth-errors';
import { useTheme } from '@/theme';

export default function Login() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    const errors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) errors.email = t('auth.validation.emailInvalid');
    if (!password) errors.password = t('auth.validation.passwordRequired');
    setFieldErrors(errors);
    setErrorKey(null);
    if (errors.email || errors.password) return;

    setBusy(true);
    try {
      // Se l'accesso riesce, la protezione delle route porta all'app: nessuna navigazione manuale.
      setErrorKey(await signIn(email, password));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('auth.login.title')}</Title>
      <Body muted>{t('auth.login.subtitle')}</Body>
      <Spacer size={24} />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer size={8} />
      <Link href="/forgot-password" accessibilityRole="link" style={[styles.link, { color: theme.text }]}>
        {t('auth.login.forgot')}
      </Link>
      <Spacer />
      <Button title={t('auth.login.submit')} onPress={onSubmit} loading={busy} />
      <Spacer size={20} />
      <View style={styles.row}>
        <Text style={{ color: theme.muted }}>{t('auth.login.noAccount')} </Text>
        <Link href="/register" accessibilityRole="link" style={[styles.link, { color: theme.text }]}>
          {t('auth.login.createAccount')}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
