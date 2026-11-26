// Ritmo comune delle schermate dell'area impostazioni (26 novembre, disegni di Nicolò):
//  - titolo sempre in alto (niente centratura verticale), con una riga di spiegazione sotto
//  - 24 punti tra le sezioni, 8 tra l'etichetta e la sua scheda
//  - una scheda bianca per gruppo, con le righe divise da una linea sottile (mai schede attaccate)
import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '@/components/Pressable';
import { Screen, SectionLabel, Title } from '@/components/ui';
import { fonts, useTheme } from '@/theme';

/** Pagina: tasto indietro, titolo, spiegazione, poi le sezioni a 24 punti l'una dall'altra. */
export function SettingsPage({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Screen back top>
      <View style={styles.page}>
        {title ? (
          <View style={styles.head}>
            <Title>{title}</Title>
            {subtitle ? <Text style={[styles.sub, { color: theme.muted }]}>{subtitle}</Text> : null}
          </View>
        ) : null}
        {children}
      </View>
    </Screen>
  );
}

/** Sezione: etichetta piccola, contenuto, nota facoltativa sotto. */
export function Section({ label, note, children }: { label?: string; note?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      {children}
      {note ? <Text style={[styles.note, { color: theme.muted }]}>{note}</Text> : null}
    </View>
  );
}

/** Scheda bianca con le righe divise da una linea sottile. */
export function Group({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={[styles.group, { backgroundColor: theme.surface }]}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.line } : null}>
          {row}
        </View>
      ))}
    </View>
  );
}

type RowProps = { icon: keyof typeof Ionicons.glyphMap; label: string; /** riga piccola sotto il titolo */ sub?: string; value?: string; danger?: boolean; chevron?: boolean; /** frase lunga: testo normale su più righe */ plain?: boolean; onPress?: () => void };

/** Riga di una scheda: icona in un riquadro, titolo, valore e freccia. Senza `onPress` non è toccabile. */
export function GroupRow({ icon, label, sub, value, danger, chevron = true, plain, onPress }: RowProps) {
  const theme = useTheme();
  const body = (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: theme.bg }]}>
        <Ionicons name={icon} size={18} color={danger ? theme.danger : theme.ink} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, plain && styles.rowPlain, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: theme.muted }]}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: theme.muted }]}>{value}</Text> : null}
      {onPress && chevron ? <Ionicons name="chevron-forward" size={18} color={theme.muted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  page: { gap: 24 },
  head: { gap: 6 },
  sub: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  section: { gap: 8 },
  note: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, marginLeft: 6 },
  group: { borderRadius: 22, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  chip: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15 },
  rowSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  rowPlain: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  rowValue: { fontFamily: fonts.medium, fontSize: 14 },
});
