import { useEffect, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';

export default function ResetPassword() {
  const { t } = useTranslation();
  const { recovering, exchangeRecoveryCode, updatePassword } = useAuth();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const exchanged = useRef(false);
  const [linkErrorKey, setLinkErrorKey] = useState<string | null>(code ? null : 'auth.reset.invalidLink');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Il codice nel link si usa una volta sola: una volta scambiato, lo stato "recovering" resta anche se la schermata si ricarica.
  useEffect(() => {
    if (!code || recovering || exchanged.current) return;
    exchanged.current = true;
    let active = true;
    (async () => {
      const failure = await exchangeRecoveryCode(code);
      if (active && failure) setLinkErrorKey(failure);
    })();
    return () => {
      active = false;
    };
  }, [code, recovering, exchangeRecoveryCode]);

  const onSubmit = async () => {
    if (busy) return;
    setErrorKey(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(t('auth.validation.passwordShort', { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setFieldError(t('auth.validation.passwordMismatch'));
      return;
    }
    setFieldError(null);
    setBusy(true);
    try {
      // Se riesce, la protezione delle route porta all'app.
      setErrorKey(await updatePassword(password));
    } finally {
      setBusy(false);
    }
  };

  if (!recovering) {
    if (linkErrorKey) {
      return (
        <Screen>
          <Title>{t('auth.reset.invalidTitle')}</Title>
          <Body muted>{t(linkErrorKey)}</Body>
          <Spacer />
          <Link href="/forgot-password" accessibilityRole="link">
            {t('auth.reset.requestNew')}
          </Link>
        </Screen>
      );
    }
    return <LoadingView />;
  }

  return (
    <Screen>
      <Title>{t('auth.reset.title')}</Title>
      <Body muted>{t('auth.reset.subtitle')}</Body>
      <Spacer size={24} />
      <TextField
        label={t('auth.reset.newPassword')}
        value={password}
        onChangeText={setPassword}
        hint={t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
      <TextField
        label={t('auth.reset.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        error={fieldError}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('auth.reset.submit')} onPress={onSubmit} loading={busy} />
    </Screen>
  );
}
