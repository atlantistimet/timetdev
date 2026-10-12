import { useColorScheme } from 'react-native';

// Palette neutra provvisoria: la palette definitiva del prodotto non è ancora stata scelta.
const light = {
  bg: '#FFFFFF',
  surface: '#F5F5F4',
  text: '#171717',
  muted: '#5F5F5A',
  line: '#D9D9D4',
  primary: '#171717',
  onPrimary: '#FFFFFF',
  danger: '#B42318',
};

const dark: typeof light = {
  bg: '#0F0F0F',
  surface: '#1A1A19',
  text: '#F5F5F4',
  muted: '#A3A39E',
  line: '#34342F',
  primary: '#F5F5F4',
  onPrimary: '#0F0F0F',
  danger: '#F97066',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
