import { Image, StyleSheet, Text, View } from 'react-native';
import { avatarUrl } from '@/lib/media';
import { initials } from '@/lib/public-profile';
import { fonts, pastelFor, useTheme } from '@/theme';

/** Foto profilo; senza foto, iniziali su fondo pastello stabile per persona. */
export function Avatar({ name, path, size = 44, seed, round, color }: { name: string; path?: string | null; size?: number; seed?: string; round?: number; color?: string }) {
  const theme = useTheme();
  const uri = avatarUrl(path);
  const box = { width: size, height: size, borderRadius: round ?? size / 2 };
  if (uri) return <Image accessibilityLabel={name} source={{ uri }} style={[box, { backgroundColor: theme.fill }]} />;
  return (
    <View style={[styles.box, box, { backgroundColor: color ?? pastelFor(seed ?? name) }]} accessibilityLabel={name}>
      <Text style={[styles.text, { fontSize: size * 0.38, color: theme.ink }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.semibold },
});
