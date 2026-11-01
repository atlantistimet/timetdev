import { useColorScheme } from 'react-native';

// Stile E (1 novembre 2026, vedi claude/timeet-design-stile-E.md). Base: "C · Chiaro + lime" (ottobre 2026): fondo grigio chiarissimo, card bianche, testo inchiostro,
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
  // Errori nei riquadri (testo su fondo) e pulsante "chiudi chiamata".
  errorText: '#9E1F24',
  errorSoft: '#FBE3E3',
  hangup: '#D93A3F',
  // Superfici sul nero (barra in basso, barre d'azione, timer) e iniziali senza foto.
  ink: '#151515',
  inkOn: '#FFFFFF',
  inkSurface: '#232321',
  inkSurface2: '#2E2E2B',
  inkMuted: '#B9B9B3',
  inkSoft: '#D6D5CF',
  initials: '#D6CBEA',
  // Fondale delle finestre dal basso.
  scrim: 'rgba(21,21,21,0.42)',
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
  errorText: '#F97066',
  errorSoft: '#3A1517',
  hangup: '#D93A3F',
  // Nel tema scuro le barre nere restano nere (leggermente più chiare dello sfondo) con testo chiaro.
  ink: '#000000',
  inkOn: '#FFFFFF',
  inkSurface: '#232321',
  inkSurface2: '#2E2E2B',
  inkMuted: '#B9B9B3',
  inkSoft: '#D6D5CF',
  initials: '#D6CBEA',
  scrim: 'rgba(0,0,0,0.6)',
};

/** Pastelli "persona": un colore per ogni venditore sul pannello grande del profilo e sulle tessere. */
export const pastels = ['#F6C9AE', '#C9DCC2', '#C6D4E6', '#D6CBEA', '#EADFC8'] as const;

/** Pastello stabile per una persona (stesso id → stesso colore). */
export function pastelFor(key: string | null | undefined): string {
  let h = 0;
  for (const ch of key ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pastels[h % pastels.length];
}

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

// Forme (stile E): pillole e bottoni 999 · pannelli grandi 40 · card 28 · tessere e caselle 22 · campi 20.
export const radius = { pill: 999, panel: 40, sheet: 40, card: 28, tile: 22, field: 20 };

/** Tipografia (stile E). Con Inter Tight il peso si sceglie dalla famiglia; letter-spacing in px = em × corpo. */
export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 56, lineHeight: 52, letterSpacing: -3.4 },
  title: { fontFamily: fonts.semibold, fontSize: 36, lineHeight: 38, letterSpacing: -1.6 },
  section: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 26, letterSpacing: -0.45 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, letterSpacing: 0 },
  small: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, letterSpacing: 0 },
} as const;
