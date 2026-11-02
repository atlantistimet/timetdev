import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { cleanTitle } from '@/lib/booking';
import { fonts, radius, useTheme } from '@/theme';

/** Pannello pastello in cima a servizio e prenotazione: indietro, emoji, titolo, chi lo offre e la pillola nera con durata e luogo. */
export function ServiceHero({
  color,
  emoji,
  title,
  sellerId,
  sellerName,
  sellerPath,
  rating,
  tag,
  onBack,
  backLabel,
}: {
  color: string;
  emoji: string | null | undefined;
  title: string;
  sellerId: string;
  sellerName: string;
  sellerPath?: string | null;
  rating?: number | null;
  tag?: string | null;
  onBack: () => void;
  backLabel: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: color }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </Pressable>
        {emoji ? (
          <View style={styles.emoji}>
            <Emoji name={emoji} size={40} />
          </View>
        ) : null}
      </View>
      <View style={styles.block}>
      <Text style={[styles.title, { color: theme.ink }]}>{cleanTitle(title)}</Text>
      <View style={styles.seller}>
        <Avatar name={sellerName} seed={sellerId} size={40} path={sellerPath} />
        <Text numberOfLines={1} style={[styles.sellerText, { color: theme.ink }]}>
          {sellerName}
          {rating ? ` · ★ ${rating.toFixed(1).replace('.', ',')}` : ''}
        </Text>
        {tag ? (
          <View style={[styles.tag, { backgroundColor: theme.ink }]}>
            <Text style={[styles.tagText, { color: theme.inkOn }]}>{tag}</Text>
          </View>
        ) : null}
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { margin: 8, minHeight: 340, justifyContent: 'space-between', borderRadius: radius.panel, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 26, gap: 28 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' },
  emoji: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.semibold, fontSize: 38, lineHeight: 40, letterSpacing: -1.7 },
  block: { gap: 20 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sellerText: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  tag: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontFamily: fonts.semibold, fontSize: 14 },
});
