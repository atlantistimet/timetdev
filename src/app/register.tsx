import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Checkbox, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isValidEmail, MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';
import { useTheme } from '@/theme';

type FieldErrors = { name?: string; email?: string; password?: string; adult?: string };

export default function Register() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const onSubmit = async () => {
    if (busy) return;
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = t('auth.validation.nameRequired');
    if (!isValidEmail(email)) errors.email = t('auth.validation.emailInvalid');
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t('auth.validation.passwordShort', { count: MIN_PASSWORD_LENGTH });
    }
    if (!adult) errors.adult = t('auth.validation.adultRequired');
    setFieldErrors(errors);
    setErrorKey(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      const result = await signUp({ fullName: name, email, password });
      if (result.errorKey) {
        setErrorKey(result.errorKey);
      } else if (result.needsEmailConfirmation) {
        setConfirmationSentTo(email.trim());
      }
      // Con la conferma email spenta la sessione nasce subito e la protezione delle route porta all'app.
    } finally {
      setBusy(false);
    }
  };

  if (confirmationSentTo) {
    return (
      <Screen>
        <Title>{t('auth.register.checkEmailTitle')}</Title>
        <Body muted>{t('auth.register.checkEmailBody', { email: confirmationSentTo })}</Body>
        <Spacer size={24} />
        <Button title={t('auth.register.backToLogin')} onPress={() => router.replace('/login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('auth.register.title')}</Title>
      <Body muted>{t('auth.register.subtitle')}</Body>
      <Spacer size={24} />
      <TextField
        label={t('auth.register.name')}
        value={name}
        onChangeText={setName}
        error={fieldErrors.name}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
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
        hint={t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
      />
      <Checkbox label={t('auth.register.adult')} checked={adult} onChange={setAdult} error={fieldErrors.adult} />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('auth.register.submit')} onPress={onSubmit} loading={busy} />
      <Spacer size={20} />
      <View style={styles.row}>
        <Text style={{ color: theme.muted }}>{t('auth.register.hasAccount')} </Text>
        <Link href="/login" accessibilityRole="link" style={[styles.link, { color: theme.text }]}>
          {t('auth.register.signIn')}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
