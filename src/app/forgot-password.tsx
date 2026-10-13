import { useState } from 'react';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isValidEmail } from '@/lib/auth-errors';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    if (busy) return;
    setErrorKey(null);
    if (!isValidEmail(email)) {
      setEmailError(t('auth.validation.emailInvalid'));
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      const failure = await requestPasswordReset(email);
      if (failure) setErrorKey(failure);
      else setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <Title>{t('auth.forgot.sentTitle')}</Title>
        {/* Stessa risposta se l'indirizzo esiste o no: non si rivela chi ha un account. */}
        <Body muted>{t('auth.forgot.sentBody', { email: email.trim() })}</Body>
        <Spacer />
        <Link href="/login" accessibilityRole="link">
          {t('auth.register.backToLogin')}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('auth.forgot.title')}</Title>
      <Body muted>{t('auth.forgot.subtitle')}</Body>
      <Spacer size={24} />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        error={emailError}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('auth.forgot.submit')} onPress={onSubmit} loading={busy} />
      <Spacer size={20} />
      <Link href="/login" accessibilityRole="link">
        {t('auth.register.backToLogin')}
      </Link>
    </Screen>
  );
}
