import { useTranslation } from 'react-i18next';
import type { Lang } from '@/content/legal';

/** Lingua dei testi legali: inglese se l'app è in inglese, altrimenti italiano. */
export function useLegalLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('en') ? 'en' : 'it';
}
