// Scelte sulle notifiche push per categoria (migrazione 0044). Valgono solo per la push sul telefono: l'elenco Notifiche nell'app riceve sempre tutto.
// I tipi di notifica di ogni categoria sono in supabase/functions/_shared/push-categories.ts: da tenere allineati.
import { supabase } from '@/lib/supabase';

export type PushCategory = 'bookings' | 'messages' | 'payments' | 'calls' | 'community' | 'reviews' | 'availability';
export type PushPrefs = Record<PushCategory, boolean>;

export const PUSH_CATEGORIES: PushCategory[] = ['bookings', 'messages', 'payments', 'calls', 'community', 'reviews', 'availability'];

const allOn: PushPrefs = { bookings: true, messages: true, payments: true, calls: true, community: true, reviews: true, availability: true };

/** Una categoria senza riga è accesa. */
export async function loadPushPrefs(userId: string): Promise<PushPrefs> {
  const { data } = await supabase.from('notification_prefs').select('category, push').eq('user_id', userId);
  const prefs = { ...allOn };
  for (const row of (data ?? []) as { category: PushCategory; push: boolean }[]) {
    if (row.category in prefs) prefs[row.category] = row.push;
  }
  return prefs;
}

/** Accende o spegne una categoria. Ritorna la chiave dell'errore, o null. */
export async function setPushCategory(category: PushCategory, enabled: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('set_push_category', { p_category: category, p_enabled: enabled });
  return error ? 'errors.generic' : null;
}
