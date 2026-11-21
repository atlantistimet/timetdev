// Check-in con QR per le sessioni in presenza (migrazione 0040, funzioni booking-checkin-token e booking-checkin).
// Regola: scansiona chi arriva, mostra chi aspetta. Sede (luogo del venditore): mostra il venditore, scansiona il cliente.
// Domicilio: mostra il cliente, scansiona il venditore. Online: niente check-in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Il check-in apre 15 minuti prima dell'inizio e chiude a fine sessione (come nel database). */
export const CHECKIN_OPENS_MIN = 15;
/** Tempo per correggere o contestare un'assenza segnata in automatico. */
export const NO_SHOW_WINDOW_MS = 24 * 3_600_000;

type Place = 'online' | 'sede' | 'domicilio';
type Status = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type CheckinBooking = {
  client_id: string;
  seller_id: string;
  place: Place;
  status: Status;
  starts_at: string;
  ends_at: string;
  checked_in_at: string | null;
  auto_no_show_at: string | null;
};

export type CheckinRole = 'show' | 'scan' | null;

/** Chi mostra il QR e chi lo scansiona: specchio di checkin_shower / checkin_scanner nel database. */
export function checkinRole(b: Pick<CheckinBooking, 'client_id' | 'seller_id' | 'place'>, me: string): CheckinRole {
  if (b.place === 'sede') return me === b.seller_id ? 'show' : me === b.client_id ? 'scan' : null;
  if (b.place === 'domicilio') return me === b.client_id ? 'show' : me === b.seller_id ? 'scan' : null;
  return null;
}

/** In corso: confermata, check-in fatto, non ancora finita. */
export const isInProgress = (b: CheckinBooking, nowMs: number) =>
  b.status === 'confirmed' && !!b.checked_in_at && new Date(b.ends_at).getTime() > nowMs;

/** Dentro la finestra del check-in (anche dopo un'assenza automatica, finché la sessione non è finita). */
export function checkinOpen(b: CheckinBooking, nowMs: number): boolean {
  if (b.place === 'online' || b.checked_in_at) return false;
  if (!(b.status === 'confirmed' || (b.status === 'no_show' && b.auto_no_show_at))) return false;
  const opens = new Date(b.starts_at).getTime() - CHECKIN_OPENS_MIN * 60_000;
  return nowMs >= opens && nowMs <= new Date(b.ends_at).getTime();
}

/** Minuti all'apertura del check-in (0 se è già aperto o passato). */
export const minutesToCheckin = (b: CheckinBooking, nowMs: number) =>
  Math.max(0, Math.ceil((new Date(b.starts_at).getTime() - CHECKIN_OPENS_MIN * 60_000 - nowMs) / 60_000));

/** Assenza automatica ancora correggibile (venditore) o contestabile (cliente): ms rimasti, altrimenti 0. */
export function noShowLeftMs(b: Pick<CheckinBooking, 'status' | 'auto_no_show_at'>, nowMs: number): number {
  if (b.status !== 'no_show' || !b.auto_no_show_at) return 0;
  return Math.max(0, new Date(b.auto_no_show_at).getTime() + NO_SHOW_WINDOW_MS - nowMs);
}

const KNOWN = ['not_found', 'wrong_party', 'already_checked_in', 'too_early', 'too_late', 'bad_token', 'too_many_attempts'];

async function errorKeyOf(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error && KNOWN.includes(body.error)) return `checkin.errors.${body.error}`;
  }
  return 'errors.generic';
}

export type CheckinCredentials = { token: string; code: string; expires_in: number; url: string };

/** Per chi mostra: token, codice a 6 cifre e secondi alla rotazione. */
export async function getCheckinCredentials(bookingId: string): Promise<{ data: CheckinCredentials | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<CheckinCredentials>('booking-checkin-token', { body: { booking_id: bookingId } });
  if (!error && data?.token) return { data, errorKey: null };
  return { data: null, errorKey: await errorKeyOf(error) };
}

/** Per chi arriva: check-in con il token del QR oppure con il codice a 6 cifre. */
export async function checkIn(bookingId: string, proof: { token: string } | { code: string }): Promise<{ checkedInAt: string | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ checked_in_at: string }>('booking-checkin', { body: { booking_id: bookingId, ...proof } });
  if (!error && data?.checked_in_at) return { checkedInAt: data.checked_in_at, errorKey: null };
  return { checkedInAt: null, errorKey: await errorKeyOf(error) };
}

/** Il QR contiene https://timeet.world/checkin/<prenotazione>/<token> (o timeet://checkin/...): ne estrae i due pezzi. */
export function parseCheckinLink(data: string): { bookingId: string; token: string } | null {
  const m = /checkin\/([0-9a-fA-F-]{36})\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/.exec(data.trim());
  return m ? { bookingId: m[1].toLowerCase(), token: m[2] } : null;
}

const rpcError = (message: string, known: string[]) => {
  const hit = known.find((k) => message.includes(k));
  return hit ? `checkin.errors.${hit}` : 'errors.generic';
};

/** Il venditore corregge l'assenza automatica: "il cliente c'era" (entro 24 ore). */
export async function confirmAttended(bookingId: string): Promise<string | null> {
  const { error } = await supabase.rpc('confirm_attended', { p_booking: bookingId });
  return error ? rpcError(error.message, ['not_correctable', 'too_late']) : null;
}

// "Era assente" / "Ok" in Agenda: la scheda dell'assenza sparisce solo su questo telefono (l'assenza diventa comunque definitiva dopo 24 ore).
const SEEN_KEY = 'timeet.noShowSeen';

export async function loadSeenNoShows(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function markNoShowSeen(bookingId: string): Promise<void> {
  try {
    const list = await loadSeenNoShows();
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([bookingId, ...list.filter((x) => x !== bookingId)].slice(0, 50)));
  } catch {
    // senza memoria locale la scheda ricompare: pazienza
  }
}

/** Il cliente contesta l'assenza automatica (entro 24 ore): diventa una segnalazione per l'assistenza. */
export async function disputeNoShow(bookingId: string, details: string): Promise<string | null> {
  const { error } = await supabase.rpc('dispute_no_show', { p_booking: bookingId, p_details: details.trim() || null });
  return error ? rpcError(error.message, ['already_disputed', 'not_disputable', 'too_late']) : null;
}
