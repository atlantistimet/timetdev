import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable } from '@/components/Pressable';
import { SheetModal } from '@/components/SheetModal';
import { Button, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { blockUser, REPORT_REASONS, sendReport, type ReportEntity, type ReportReason } from '@/lib/safety';
import { fonts, radius, useTheme } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Cosa si segnala. */
  entityType: ReportEntity;
  entityId: string;
  /** Autore del contenuto: se presente si può anche bloccare. */
  userId?: string | null;
  name?: string;
  /** 'menu' = scelta Segnala/Blocca; 'report' = parte dai motivi. */
  start?: 'menu' | 'report';
  onDone?: (what: 'reported' | 'blocked') => void;
};

/** Foglio per segnalare un contenuto o bloccare una persona: menu, motivo, dettaglio e conferma. */
export function SafetySheet({ visible, onClose, entityType, entityId, userId, name, start = 'menu', onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { session } = useAuth();
  const me = session?.user.id ?? null;
  const [step, setStep] = useState<'menu' | 'reason' | 'detail' | 'block' | 'done' | 'blocked'>(start === 'report' ? 'reason' : 'menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const canBlock = !!userId && userId !== me;
  const first = (name ?? '').split(/\s+/)[0] ?? '';

  const close = () => {
    onClose();
    setTimeout(() => {
      setStep(start === 'report' ? 'reason' : 'menu');
      setReason(null);
      setDetails('');
      setAlsoBlock(false);
      setErrorKey(null);
    }, 300);
  };

  const submit = async () => {
    if (!me || !reason) return;
    setBusy(true);
    setErrorKey(null);
    const failure = await sendReport({ me, entityType, entityId, reason, details, blockUserId: alsoBlock && canBlock ? userId : null });
    setBusy(false);
    if (failure) return setErrorKey(failure);
    setStep('done');
    onDone?.(alsoBlock ? 'blocked' : 'reported');
  };

  const block = async () => {
    if (!userId) return;
    setBusy(true);
    const failure = await blockUser(userId);
    setBusy(false);
    if (failure) return setErrorKey(failure);
    setStep('blocked');
    onDone?.('blocked');
  };

  const row = (icon: React.ComponentProps<typeof Ionicons>['name'], label: string, onPress: () => void, danger?: boolean, selected?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.row, { backgroundColor: theme.surface, borderColor: selected ? theme.ink : 'transparent' }]}>
      <Ionicons name={icon} size={20} color={danger ? theme.danger : theme.text} />
      <Text style={[styles.rowText, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.muted} />
    </Pressable>
  );

  return (
    <SheetModal visible={visible} onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.bg }]}>
        {step === 'menu' ? (
          <>
            {row('flag-outline', t('safety.report'), () => setStep('reason'), true)}
            {canBlock ? row('ban-outline', t('safety.block', { name: first }), () => setStep('block'), true) : null}
          </>
        ) : null}
        {step === 'reason' ? (
          <ScrollView style={{ maxHeight: 460 }}>
            <Text style={[styles.h, { color: theme.text }]}>{t('safety.whatsWrong')}</Text>
            <Text style={[styles.sub, { color: theme.muted }]}>{t('safety.anonymous')}</Text>
            {REPORT_REASONS.map((r) => (
              <View key={r}>{row('chevron-forward', t(`safety.reason.${r}`), () => { setReason(r); setStep('detail'); }, false, reason === r)}</View>
            ))}
          </ScrollView>
        ) : null}
        {step === 'detail' && reason ? (
          <>
            <Text style={[styles.h, { color: theme.text }]}>{t('safety.addDetail')}</Text>
            <TextInput value={details} onChangeText={setDetails} placeholder={t('safety.detailPlaceholder')} placeholderTextColor={theme.muted} multiline maxLength={1000} style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]} />
            {canBlock ? (
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: alsoBlock }} onPress={() => setAlsoBlock((v) => !v)} style={[styles.row, { backgroundColor: theme.surface, borderColor: 'transparent' }]}>
                <Ionicons name="ban-outline" size={20} color={theme.text} />
                <Text style={[styles.rowText, { color: theme.text }]}>{t('safety.alsoBlock', { name: first })}</Text>
                <View style={[styles.sw, { backgroundColor: alsoBlock ? theme.ink : theme.fill }]}><View style={[styles.knob, { backgroundColor: alsoBlock ? theme.accent : '#FFFFFF', left: alsoBlock ? 18 : 2 }]} /></View>
              </Pressable>
            ) : null}
            {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
            <View style={{ height: 8 }} />
            <Button title={t('safety.send')} onPress={() => void submit()} loading={busy} />
          </>
        ) : null}
        {step === 'block' ? (
          <>
            <Text style={[styles.h, { color: theme.text }]}>{t('safety.blockTitle', { name: first })}</Text>
            <Text style={[styles.sub, { color: theme.muted }]}>{t('safety.blockBody')}</Text>
            {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
            <View style={{ height: 8 }} />
            <Button title={t('safety.blockConfirm', { name: first })} onPress={() => void block()} loading={busy} />
            <Button title={t('common.cancel')} variant="ghost" onPress={close} />
          </>
        ) : null}
        {step === 'done' ? (
          <>
            <Text style={[styles.h, { color: theme.text }]}>{t('safety.thanks')}</Text>
            <Text style={[styles.sub, { color: theme.muted }]}>{t('safety.thanksBody')}</Text>
            <Button title={t('common.close')} onPress={close} />
          </>
        ) : null}
        {step === 'blocked' ? (
          <>
            <Text style={[styles.h, { color: theme.text }]}>{t('safety.blocked', { name: first })}</Text>
            <Text style={[styles.sub, { color: theme.muted }]}>{t('safety.blockedBody')}</Text>
            <Button title={t('common.close')} onPress={close} />
          </>
        ) : null}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 20, paddingBottom: 36, gap: 8 },
  h: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 6, borderWidth: 2 },
  rowText: { flex: 1, fontFamily: fonts.medium, fontSize: 16 },
  input: { minHeight: 96, borderRadius: 20, padding: 14, fontFamily: fonts.regular, fontSize: 16, textAlignVertical: 'top' },
  sw: { width: 38, height: 22, borderRadius: 12, justifyContent: 'center' },
  knob: { position: 'absolute', top: 2, width: 18, height: 18, borderRadius: 9 },
});
