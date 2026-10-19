import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

// Chi apre un link dell'app (es. /s/<codice>) senza essere entrato viene portato al login: qui ricordiamo dove voleva andare,
// per riportarlo lì appena ha accesso.
const SHAREABLE = /^\/(s|u|service|p)\/[^/?#]+/;
let pending: string | null = null;

const remember = (path: string | null | undefined) => {
  if (!path) return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (SHAREABLE.test(normalized)) pending = normalized;
};

// Sul web l'indirizzo iniziale è quello della pagina; sul telefono arriva dal collegamento che ha aperto l'app.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  remember(window.location.pathname);
} else {
  Linking.getInitialURL()
    .then((url) => remember(url ? Linking.parse(url).path : null))
    .catch(() => {});
}
Linking.addEventListener('url', ({ url }) => remember(Linking.parse(url).path));

export const takePendingPath = (): string | null => {
  const path = pending;
  pending = null;
  return path;
};
