import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import it from './locales/it.json';
import en from './locales/en.json';

// Per aggiungere una lingua: nuovo file in ./locales e una riga qui sotto.
export const resources = { it: { translation: it }, en: { translation: en } } as const;
export const supportedLanguages = Object.keys(resources);
export const fallbackLanguage = 'it';

export function deviceLanguage(): string {
  const code = getLocales()[0]?.languageCode ?? fallbackLanguage;
  return supportedLanguages.includes(code) ? code : fallbackLanguage;
}

i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: fallbackLanguage,
  interpolation: { escapeValue: false },
});

export default i18n;
