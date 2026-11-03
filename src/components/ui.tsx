import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, radius, type as typo, useTheme } from '@/theme';

/** Contenitore di schermata: area sicura, tastiera che non copre i campi, contenuto centrato e largo al massimo 440. */
export function Screen({ children, tabs, wide, bare, footer, back, flush }: { children: ReactNode; tabs?: boolean; wide?: boolean; bare?: boolean; footer?: ReactNode; back?: boolean; flush?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: flush ? theme.surface : theme.bg }]}>
      {back ? (
        <View style={[styles.screenColumn, wide && styles.screenColumnWide, styles.backBar]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Indietro"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={[styles.backBtn, { backgroundColor: theme.surface }]}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
        </View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.screenContent, tabs && styles.screenTabs, (bare || flush) && styles.screenBare, footer ? styles.screenFooter : null]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={[styles.screenColumn, wide && styles.screenColumnWide]}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
      {footer ? (
        <View pointerEvents="box-none" style={styles.footerWrap}>
          <View style={styles.footerColumn}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const theme = useTheme();
  return <Text style={[styles.body, { color: muted ? theme.muted : theme.text }]}>{children}</Text>;
}

type TextFieldProps = TextInputProps & { label: string; error?: string | null; hint?: string };

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, style, ...inputProps },
  ref,
) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.fill, borderColor: theme.danger, borderWidth: error ? 1.5 : 0 },
          style,
        ]}
        {...inputProps}
      />
      {error ? <ErrorText>{error}</ErrorText> : hint ? <Text style={[styles.hint, { color: theme.muted }]}>{hint}</Text> : null}
    </View>
  );
});

export function ErrorText({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
      {children}
    </Text>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  /** primary = nero (azione principale) · accent = lime (azione chiave) · dark = nero (alias di primary) · ghost = grigio pieno. */
  variant?: 'primary' | 'accent' | 'dark' | 'ghost';
};

export function Button({ title, onPress, loading, variant = 'primary' }: ButtonProps) {
  const theme = useTheme();
  const bg = variant === 'accent' ? theme.accent : variant === 'ghost' ? theme.fill : theme.primary;
  const fg = variant === 'accent' ? theme.onAccent : variant === 'ghost' ? theme.text : theme.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => onChange(!checked)}
        style={styles.checkboxRow}>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: error ? theme.danger : theme.text,
              backgroundColor: checked ? theme.primary : 'transparent',
            },
          ]}>
          {checked ? <Text style={[styles.checkmark, { color: theme.onPrimary }]}>✓</Text> : null}
        </View>
        <Text style={[styles.checkboxLabel, { color: theme.text }]}>{label}</Text>
      </Pressable>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** Pillola selezionabile (sconti, giorni, durate...). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? theme.primary : theme.fill }]}>
      <Text style={[styles.chipText, { color: selected ? theme.onPrimary : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Righe di pillole che vanno a capo. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** Card bianca senza bordo (stile E: angoli 28). */
export function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface }]}>{children}</View>;
}

/** Card toccabile con titolo e riga di spiegazione. */
export function CardButton({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.surface }, pressed && styles.pressed]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.body, { color: theme.muted }]}>{subtitle}</Text> : null}
    </Pressable>
  );
}

/** Pillola informativa: lime per gli stati "live" (Disponibile ora), nera per i prezzi, grigia per il resto. */
export function Pill({
  label,
  tone = 'neutral',
  dot,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'dark' | 'price';
  dot?: boolean;
}) {
  const theme = useTheme();
  const bg = tone === 'accent' ? theme.accent : tone === 'neutral' ? theme.fill : theme.ink;
  const fg = tone === 'accent' ? theme.onAccent : tone === 'neutral' ? theme.text : tone === 'price' ? theme.accent : theme.inkOn;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.pillDot, { backgroundColor: fg }]} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Pannello grande e morbido (angoli 40). Con `color` diventa un pannello pastello (persona). */
export function Panel({ children, color, dark }: { children: ReactNode; color?: string; dark?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: color ?? (dark ? theme.ink : theme.surface) }]}>{children}</View>
  );
}

/** Barra d'azione nera in basso: prezzo (o testo) a sinistra, bottone lime a destra. */
export function ActionBar({
  label,
  caption,
  actionTitle,
  onAction,
  loading,
  disabled,
  oldLabel,
  badge,
}: {
  label: string;
  caption?: string;
  actionTitle: string;
  onAction: () => void;
  loading?: boolean;
  disabled?: boolean;
  oldLabel?: string;
  badge?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.actionBar, { backgroundColor: theme.ink }]}>
      <View style={styles.actionText}>
        <View style={styles.actionPriceRow}>
          <Text style={[styles.actionLabel, { color: theme.inkOn }]}>{label}</Text>
          {oldLabel ? <Text style={[styles.actionOld, { color: theme.inkMuted }]}>{oldLabel}</Text> : null}
          {badge ? (
            <View style={[styles.actionBadge, { backgroundColor: theme.accent }]}>
              <Text style={[styles.actionBadgeText, { color: theme.onAccent }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {caption ? <Text style={[styles.actionCaption, { color: theme.inkMuted }]}>{caption}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!loading || !!disabled, busy: !!loading }}
        disabled={loading || disabled}
        onPress={onAction}
        style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.accent }, pressed && styles.pressed, (loading || disabled) && styles.disabled]}>
        {loading ? <ActivityIndicator color={theme.onAccent} /> : <Text style={[styles.buttonText, { color: theme.onAccent }]}>{actionTitle}</Text>}
      </Pressable>
    </View>
  );
}

export function LoadingView() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.bg }]}>
      <ActivityIndicator color={theme.text} />
    </View>
  );
}

export function Spacer({ size = 16 }: { size?: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // La barra in basso è sempre visibile (tranne nelle chat e in chiamata): il contenuto lascia spazio sotto.
  screenContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 130 },
  screenTabs: { justifyContent: 'flex-start', paddingBottom: 130 },
  screenBare: { justifyContent: 'flex-start', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 130 },
  screenFooter: { paddingBottom: 210 },
  backBar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footerWrap: { position: 'absolute', left: 12, right: 12, bottom: 108, alignItems: 'center' },
  footerColumn: { width: '100%', maxWidth: 440 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: radius.pill },
  chipText: { fontSize: 15, fontFamily: fonts.semibold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  card: { borderRadius: radius.card, padding: 18, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontFamily: fonts.semibold, letterSpacing: -0.3, marginBottom: 2 },
  screenColumn: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  screenColumnWide: { maxWidth: 960 },
  title: { ...typo.title, marginBottom: 10 },
  body: { ...typo.body },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontFamily: fonts.semibold, marginBottom: 6 },
  input: { minHeight: 54, borderRadius: radius.field, paddingHorizontal: 16, fontSize: 16, fontFamily: fonts.medium },
  hint: { fontSize: 13, marginTop: 6, fontFamily: fonts.regular },
  error: { fontSize: 13, marginTop: 6, fontFamily: fonts.regular },
  button: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  buttonText: { fontSize: 17, fontFamily: fonts.semibold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.7 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkmark: { fontSize: 15, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: fonts.regular },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 14, fontFamily: fonts.semibold },
  panel: { borderRadius: radius.panel, padding: 24, marginBottom: 8 },
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.pill, paddingVertical: 8, paddingLeft: 24, paddingRight: 8, gap: 12 },
  actionText: { flexShrink: 1 },
  actionLabel: { fontSize: 20, fontFamily: fonts.semibold, letterSpacing: -0.5 },
  actionPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionOld: { fontSize: 14, fontFamily: fonts.medium, textDecorationLine: 'line-through' },
  actionBadge: { height: 22, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionBadgeText: { fontSize: 12, fontFamily: fonts.semibold },
  actionCaption: { fontSize: 13, fontFamily: fonts.medium },
  actionButton: { minHeight: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
