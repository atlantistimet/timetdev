import { useColorScheme } from 'react-native';

// Stile "Mono" del prototipo: fondo grigio chiaro, card bianche senza bordi, campi e pulsanti secondari pieni grigi,
// nero come colore principale, verde solo per gli accenti.
const light = {
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  fill: '#EBEBED',
  text: '#000000',
  muted: '#6E6E73',
  line: '#EFEFF1',
  primary: '#000000',
  onPrimary: '#FFFFFF',
  accent: '#05A660',
  accentSoft: '#E3F7EC',
  glass: 'rgba(246,246,248,0.92)',
  glassOn: '#FFFFFF',
  danger: '#B42318',
};

const dark: typeof light = {
  bg: '#000000',
  surface: '#161618',
  fill: '#232326',
  text: '#FFFFFF',
  muted: '#9A9AA0',
  line: '#232326',
  primary: '#FFFFFF',
  onPrimary: '#000000',
  accent: '#1ED37A',
  accentSoft: '#0F2A1C',
  glass: 'rgba(40,40,44,0.92)',
  glassOn: 'rgba(255,255,255,0.16)',
  danger: '#F97066',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
