import { useColorScheme } from 'react-native';

// Tema "C · Chiaro + lime" (ottobre 2026): fondo grigio chiarissimo, card bianche, testo inchiostro,
// lime come accento. Regola: sui fondi chiari il lime è sempre un FONDO con testo scuro sopra (onAccent),
// mai un colore di testo o di linee sottili. Su nero può colorare anche numeri e barre.
const light = {
  bg: '#F2F2EF',
  surface: '#FFFFFF',
  fill: '#E8E7E3',
  text: '#151515',
  muted: '#6A6A65',
  line: '#ECEBE7',
  // Nero: selezioni, chip attive, "Chiama", bolle inviate.
  primary: '#151515',
  onPrimary: '#FFFFFF',
  // Lime: azione principale (Prenota, Blocca e chiama), stati "live" (Disponibile ora, In chiamata).
  accent: '#E7FF67',
  onAccent: '#151515',
  accentSoft: '#F4FFC4',
  success: '#1F6B43',
  successSoft: '#E3F1E8',
  // Barra in basso e pulsanti sopra le foto.
  glass: 'rgba(255,255,255,0.96)',
  glassOn: '#E7FF67',
  danger: '#B42318',
};

const dark: typeof light = {
  bg: '#0F0F0E',
  surface: '#1B1B19',
  fill: '#262624',
  text: '#F4F4F1',
  muted: '#A3A39C',
  line: '#2A2A27',
  primary: '#F4F4F1',
  onPrimary: '#151515',
  accent: '#E7FF67',
  onAccent: '#151515',
  accentSoft: '#2C3310',
  success: '#6FD49A',
  successSoft: '#13291C',
  glass: 'rgba(27,27,25,0.96)',
  glassOn: '#E7FF67',
  danger: '#F97066',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

// Carattere unico: Inter Tight (caricato in src/app/_layout.tsx). Con i font personalizzati
// il peso si sceglie dalla famiglia, non da fontWeight.
export const fonts = {
  light: 'InterTight_300Light',
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  semibold: 'InterTight_600SemiBold',
};

// Forme: pillole per azioni e chip, card 24, campi 14.
export const radius = { pill: 999, card: 24, sheet: 28, field: 14, tile: 16 };
