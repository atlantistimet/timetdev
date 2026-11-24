import type { ConfigContext, ExpoConfig } from 'expo/config';

// Due app dallo stesso codice (decisione del 23 novembre 2026):
//  - APP_VARIANT=production  → app vera (TestFlight e App Store): world.timeet, nome "Timeet"
//  - APP_VARIANT=development, oppure senza variabile → app di sviluppo: world.timeet.dev, nome "Timeet Dev"
// Il resto della configurazione sta in app.json, che qui è il punto di partenza.
const VARIANTS = ['development', 'production'] as const;
const raw = process.env.APP_VARIANT;

if (raw !== undefined && !(VARIANTS as readonly string[]).includes(raw)) {
  // Un refuso (es. "prod") non deve produrre in silenzio la variante sbagliata.
  throw new Error(`APP_VARIANT non valido: "${raw}". Valori ammessi: ${VARIANTS.join(', ')}.`);
}

const IS_PRODUCTION = raw === 'production';
const IDENTIFIER = IS_PRODUCTION ? 'world.timeet' : 'world.timeet.dev';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  slug: config.slug ?? 'timeet',
  name: IS_PRODUCTION ? 'Timeet' : 'Timeet Dev',
  ios: { ...config.ios, bundleIdentifier: IDENTIFIER },
  android: { ...config.android, package: IDENTIFIER },
  // lo schema generato da expo-dev-client serve solo allo sviluppo
  plugins: (config.plugins ?? []).map((plugin) => (plugin === 'expo-dev-client' ? ['expo-dev-client', { addGeneratedScheme: !IS_PRODUCTION }] : plugin)),
});
