// Parte alta trasparente (disegno B, 26 novembre, come Instagram): ciò che scorre sotto la testata si sfoca e svanisce verso il basso,
// invece di fermarsi contro un blocco colorato. La sfocatura è una sola, nascosta da una maschera a gradiente morbido (niente bande),
// sotto un velo del colore di sfondo che svanisce con la stessa curva. Su Android la sfocatura vera non c'è: resta il velo.
import { useId } from 'react';
import { Platform, StyleSheet, View, useColorScheme, type ViewStyle } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme';

// Curva di svanimento (posizione, opacità): morbida, più lenta all'inizio e alla fine.
const CURVE: [number, number][] = [
  [0, 1], [0.1, 0.97], [0.2, 0.92], [0.3, 0.84], [0.4, 0.73], [0.5, 0.6], [0.6, 0.46], [0.7, 0.32], [0.8, 0.19], [0.9, 0.08], [1, 0],
];
const BLUR = 55;
const VEIL = 0.62;
const CSS_MASK = `linear-gradient(to bottom, ${CURVE.map(([p, a]) => `rgba(0,0,0,${a}) ${p * 100}%`).join(', ')})`;

function rgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Colore semitrasparente per i pulsanti che galleggiano sopra la sfumatura (cerchi del tasto indietro, della chiamata, ecc.). */
export function glassColor(surface: string): string {
  return rgba(surface, 0.78);
}

function Gradient({ color, peak }: { color: string; peak: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {CURVE.map(([p, a]) => (
            <Stop key={p} offset={p} stopColor={color} stopOpacity={a * peak} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** `color` = colore di sfondo della schermata sotto (di solito `theme.bg`; `theme.surface` nelle schermate a tutto schermo come la Home). */
export function TopFade({ height, color }: { height: number; color?: string }) {
  const theme = useTheme();
  const tint = useColorScheme() === 'dark' ? 'dark' : 'light';
  const veil = color ?? theme.bg;
  const blur = <BlurView tint={tint} intensity={BLUR} style={StyleSheet.absoluteFill} />;
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      {Platform.OS === 'ios' ? (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<Gradient color="#000000" peak={1} />}>
          {blur}
        </MaskedView>
      ) : Platform.OS === 'web' ? (
        <View style={[StyleSheet.absoluteFill, { maskImage: CSS_MASK, WebkitMaskImage: CSS_MASK } as unknown as ViewStyle]}>{blur}</View>
      ) : null}
      <Gradient color={veil} peak={VEIL} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
});
