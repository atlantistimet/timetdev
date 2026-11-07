import { useRef, useState } from 'react';
import { StyleSheet, Text, View, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { Body, Button, ErrorText, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isValidEmail, MIN_PASSWORD_LENGTH } from '@/lib/auth-errors';
import { fonts, useTheme } from '@/theme';

const STEPS = 4;

function ConsentCard({ title, text, on, onToggle, required, onRead, readLabel, dark }: { title: string; text: string; on: boolean; onToggle: () => void; required?: boolean; onRead?: () => void; readLabel?: string; dark?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: dark ? theme.ink : theme.surface }]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={title} onPress={onToggle} style={styles.cardRow}>
        <View style={[styles.tick, { backgroundColor: on ? theme.accent : 'transparent', borderColor: on ? theme.accent : theme.muted }]}>
          {on ? <Ionicons name="checkmark" size={16} color={theme.onAccent} /> : null}
        </View>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: dark ? '#FFFFFF' : theme.text }]}>{title}{required ? ' *' : ''}</Text>
          <Text style={[styles.cardText, { color: dark ? 'rgba(255,255,255,0.7)' : theme.muted }]}>{text}</Text>
        </View>
      </Pressable>
      {onRead ? (
        <Pressable accessibilityRole="link" onPress={onRead}>
          <Text style={[styles.read, { color: dark ? theme.accent : theme.text }]}>{readLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Register() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { signUp } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const back = () => {
    setFieldError(null);
    setErrorKey(null);
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await signUp({ fullName: name, email, password, marketing });
      if (result.errorKey) setErrorKey(result.errorKey);
      else if (result.needsEmailConfirmation) setConfirmationSentTo(email.trim());
      // Con la conferma email spenta la sessione nasce subito e la protezione delle route porta all'app.
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (busy) return;
    setErrorKey(null);
    if (step === 1) {
      if (!name.trim()) return setFieldError(t('auth.validation.nameRequired'));
    } else if (step === 2) {
      if (!isValidEmail(email)) return setFieldError(t('auth.validation.emailInvalid'));
    } else if (step === 3) {
      if (password.length < MIN_PASSWORD_LENGTH) return setFieldError(t('auth.validation.passwordShort', { count: MIN_PASSWORD_LENGTH }));
    } else {
      if (!adult) return setFieldError(t('auth.validation.adultRequired'));
      if (!terms) return setFieldError(t('legal.termsRequired'));
      void submit();
      return;
    }
    setFieldError(null);
    setStep(step + 1);
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

  const heading = [t('reg.nameTitle'), t('reg.emailTitle'), t('reg.passwordTitle'), t('reg.lastTitle')][step - 1];
  const sub = [t('reg.nameSub'), t('reg.emailSub'), t('reg.passwordSub', { count: MIN_PASSWORD_LENGTH }), t('reg.lastSub')][step - 1];

  return (
    <Screen>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={back} style={[styles.backBtn, { backgroundColor: theme.surface }]}>
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </Pressable>
        <View style={[styles.track, { backgroundColor: theme.fill }]}>
          <View style={[styles.bar, { backgroundColor: theme.ink, width: `${(step / STEPS) * 100}%` }]} />
        </View>
        <Text style={[styles.count, { color: theme.muted }]}>{t('reg.stepOf', { n: step, total: STEPS })}</Text>
      </View>
      <Spacer size={20} />
      <Title>{heading}</Title>
      <Body muted>{sub}</Body>
      <Spacer size={20} />

      {step === 1 ? (
        <TextField
          label={t('auth.register.name')}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={next}
        />
      ) : null}
      {step === 2 ? (
        <TextField
          ref={emailRef}
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoFocus
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={next}
        />
      ) : null}
      {step === 3 ? (
        <TextField
          label={t('auth.password')}
          hint={t('auth.register.passwordHint', { count: MIN_PASSWORD_LENGTH })}
          value={password}
          onChangeText={setPassword}
          autoFocus
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={next}
        />
      ) : null}
      {step === 4 ? (
        <View style={styles.cards}>
          <ConsentCard dark required title={t('reg.adultTitle')} text={t('reg.adultText')} on={adult} onToggle={() => setAdult(!adult)} />
          <ConsentCard
            dark
            required
            title={t('reg.termsTitle')}
            text={t('reg.termsText')}
            on={terms}
            onToggle={() => setTerms(!terms)}
            onRead={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
            readLabel={t('reg.readTerms')}
          />
          <ConsentCard title={t('reg.marketingTitle')} text={t('reg.marketingText')} on={marketing} onToggle={() => setMarketing(!marketing)} />
          <Text style={[styles.fine, { color: theme.muted }]}>
            {t('reg.privacyNote')}{' '}
            <Text style={{ color: theme.text, textDecorationLine: 'underline' }} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
              {t('reg.privacyLink')}
            </Text>
          </Text>
        </View>
      ) : null}

      {fieldError ? <ErrorText>{fieldError}</ErrorText> : null}
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={step === STEPS ? t('reg.create') : t('reg.continue')} onPress={next} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  count: { fontFamily: fonts.medium, fontSize: 13 },
  cards: { gap: 10 },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  cardText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, marginTop: 2 },
  read: { fontFamily: fonts.semibold, fontSize: 14, marginLeft: 38 },
  fine: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginTop: 4 },
});
