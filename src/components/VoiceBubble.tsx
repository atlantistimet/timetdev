import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fonts, useTheme } from '@/theme';

const BARS = [6, 12, 8, 16, 10, 20, 14, 8, 18, 12, 6, 16, 22, 10, 14, 8, 18, 12, 6, 14, 10, 18, 8, 12];

export const clock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Messaggio vocale: tasto play, onde che si colorano mentre scorre e durata. */
export function VoiceBubble({ uri, durationMs, mine }: { uri: string; durationMs?: number; mine: boolean }) {
  const theme = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : (durationMs ?? 0) / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const fg = mine ? '#FFFFFF' : theme.text;
  const dim = mine ? theme.inkMuted : theme.fill;
  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (total > 0 && status.currentTime >= total - 0.1) void player.seekTo(0);
    player.play();
  };
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={toggle} style={[styles.play, { backgroundColor: mine ? theme.accent : theme.ink }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={mine ? theme.onAccent : '#FFFFFF'} />
      </Pressable>
      <View style={styles.bars}>
        {BARS.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / BARS.length < progress ? (mine ? theme.accent : theme.ink) : dim }} />
        ))}
      </View>
      <Text style={[styles.time, { color: fg }]}>{clock(status.playing || progress > 0 ? status.currentTime : total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, minWidth: 220 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 24 },
  time: { fontFamily: fonts.medium, fontSize: 13, width: 36, textAlign: 'right' },
});
