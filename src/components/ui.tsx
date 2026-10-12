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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

/** Contenitore di schermata: area sicura, tastiera che non copre i campi, contenuto centrato e largo al massimo 440. */
export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.screenContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.screenColumn}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
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
          { color: theme.text, backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.line },
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
  variant?: 'primary' | 'ghost';
};

export function Button({ title, onPress, loading, variant = 'primary' }: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: theme.primary }
          : { backgroundColor: 'transparent', borderColor: theme.line, borderWidth: 1 },
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? theme.onPrimary : theme.text} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? theme.onPrimary : theme.text }]}>{title}</Text>
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
  screenContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  screenColumn: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 16, lineHeight: 22 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  hint: { fontSize: 13, marginTop: 6 },
  error: { fontSize: 13, marginTop: 6 },
  button: { minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.7 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  checkmark: { fontSize: 15, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 15, lineHeight: 21 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
