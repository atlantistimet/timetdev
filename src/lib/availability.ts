// Disponibilità del venditore: orario settimanale valido in un periodo (generale, per servizio o per offerta) + giorni chiusi.
// Le regole vere stanno nel database (migrazione 0017); qui si specchiano solo per mostrare gli errori accanto alla fascia.
import { supabase } from '@/lib/supabase';
import { localParts } from '@/lib/validity';

export type Scope = 'general' | 'service' | 'offer';
export type DayRange = { start: string; end: string }; // "HH:MM" (la fine può essere "24:00")
export type DayDraft = { active: boolean; ranges: DayRange[] };
/** Sette giorni, indice 0 = lunedì … 6 = domenica. */
export type ScheduleDraft = { startsOn: string; endsOn: string; days: DayDraft[] };
export type StoredSchedule = ScheduleDraft & { id: string; scope: Scope };

export const MAX_RANGES = 5;
export const STEP_MIN = 15;
export const DEFAULT_RANGE: DayRange = { start: '09:00', end: '12:00' };

export const toMinutes = (hhmm: string): number => {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export const fromMinutes = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Data di oggi (AAAA-MM-GG) in ora di Roma. */
export const todayRome = (nowMs: number): string => localParts(new Date(nowMs)).date;

/** Stessa data tra `months` mesi; se quel giorno non esiste, l'ultimo giorno del mese (30/11 → 28/02). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export const emptyDraft = (nowMs: number): ScheduleDraft => {
  const today = todayRome(nowMs);
  return { startsOn: today, endsOn: addMonths(today, 3), days: Array.from({ length: 7 }, () => ({ active: false, ranges: [] })) };
};

export const cloneDraft = (d: ScheduleDraft): ScheduleDraft => ({
  startsOn: d.startsOn, endsOn: d.endsOn, days: d.days.map((x) => ({ active: x.active, ranges: x.ranges.map((r) => ({ ...r })) })),
});

/** Errori per fascia: chiave "giorno:fascia" (0–6 : indice) → codice. Più errori di periodo sotto la chiave "period". */
export type DraftErrors = Record<string, 'end_before_start' | 'overlap' | 'step' | 'too_many' | 'bad_time' | 'period' | 'no_ranges'>;

export function validateDraft(d: ScheduleDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(d.endsOn) || d.endsOn < d.startsOn) errors.period = 'period';
  d.days.forEach((day, wd) => {
    if (!day.active) return;
    if (day.ranges.length === 0) errors[`${wd}:0`] = 'no_ranges';
    if (day.ranges.length > MAX_RANGES) errors[`${wd}:${MAX_RANGES}`] = 'too_many';
    day.ranges.forEach((r, i) => {
      const a = toMinutes(r.start);
      const b = toMinutes(r.end);
      const key = `${wd}:${i}`;
      if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b > 24 * 60) errors[key] = 'bad_time';
      else if (a % STEP_MIN !== 0 || b % STEP_MIN !== 0) errors[key] = 'step';
      else if (b <= a) errors[key] = 'end_before_start';
      else if (day.ranges.some((o, j) => j !== i && toMinutes(o.start) < b && toMinutes(o.end) > a)) errors[key] = 'overlap';
    });
  });
  return errors;
}

type RangeRow = { weekday: number; start_time: string; end_time: string };
type ScheduleRow = { id: string; scope: Scope; starts_on: string; ends_on: string; availability_ranges: RangeRow[] };

function rowToStored(row: ScheduleRow): StoredSchedule {
  const days: DayDraft[] = Array.from({ length: 7 }, () => ({ active: false, ranges: [] }));
  [...row.availability_ranges]
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
    .forEach((r) => {
      const day = days[r.weekday - 1];
      day.active = true;
      day.ranges.push({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) });
    });
  return { id: row.id, scope: row.scope, startsOn: row.starts_on, endsOn: row.ends_on, days };
}

const SELECT = 'id, scope, starts_on, ends_on, availability_ranges(weekday, start_time, end_time)';

/** La disponibilità propria di `scope` (null se non esiste). */
export async function loadSchedule(sellerId: string, scope: Scope, targetId: string | null): Promise<StoredSchedule | null> {
  let query = supabase.from('availability_schedules').select(SELECT).eq('seller_id', sellerId).eq('scope', scope);
  if (scope === 'service') query = query.eq('service_id', targetId ?? '');
  if (scope === 'offer') query = query.eq('offer_id', targetId ?? '');
  const { data } = await query.maybeSingle();
  return data ? rowToStored(data as unknown as ScheduleRow) : null;
}

/** Quella che vale oggi per un servizio (la sua, altrimenti la generale): serve come punto di partenza per una "specifica". */
export async function loadInherited(sellerId: string, serviceId: string | null, nowMs: number): Promise<ScheduleDraft> {
  const own = serviceId ? await loadSchedule(sellerId, 'service', serviceId) : null;
  const found = own ?? (await loadSchedule(sellerId, 'general', null));
  return found ? cloneDraft(found) : emptyDraft(nowMs);
}

const MESSAGES: [string, string][] = [['too_many_ranges', 'too_many'], ['ranges_overlap', 'overlap'], ['step_15', 'step']];

/** Salva (crea o sostituisce) in un colpo solo. Ritorna null se va bene, altrimenti una chiave di errore. */
export async function saveSchedule(scope: Scope, serviceId: string | null, offerId: string | null, draft: ScheduleDraft): Promise<string | null> {
  const ranges = draft.days.flatMap((day, i) => (day.active ? day.ranges.map((r) => ({ weekday: i + 1, start: r.start, end: r.end })) : []));
  const { error } = await supabase.rpc('save_availability', { p_scope: scope, p_service: serviceId, p_offer: offerId, p_starts: draft.startsOn, p_ends: draft.endsOn, p_ranges: ranges });
  if (!error) return null;
  const hit = MESSAGES.find(([text]) => error.message.includes(text));
  return hit ? `availability.errors.${hit[1]}` : 'errors.generic';
}

export async function deleteSchedule(id: string): Promise<string | null> {
  const { error } = await supabase.from('availability_schedules').delete().eq('id', id);
  return error ? 'errors.generic' : null;
}

// ---------- Giorni chiusi ----------
export type ClosedDay = { day: string; note: string | null };

export async function listClosedDays(sellerId: string, fromDay: string): Promise<ClosedDay[]> {
  const { data } = await supabase.from('seller_closed_days').select('day, note').eq('seller_id', sellerId).gte('day', fromDay).order('day');
  return (data ?? []) as ClosedDay[];
}
export async function addClosedDay(sellerId: string, day: string, note: string): Promise<string | null> {
  const { error } = await supabase.from('seller_closed_days').upsert({ seller_id: sellerId, day, note: note.trim() || null }, { onConflict: 'seller_id,day' });
  return error ? 'errors.generic' : null;
}
export async function removeClosedDay(sellerId: string, day: string): Promise<string | null> {
  const { error } = await supabase.from('seller_closed_days').delete().eq('seller_id', sellerId).eq('day', day);
  return error ? 'errors.generic' : null;
}

// ---------- Finestre prenotabili e controlli ----------
export type Window = { from: number; to: number };

/** Finestre libere (disponibilità risolta, giorni chiusi e occupato già tolti) tra due istanti. */
export async function loadWindows(sellerId: string, serviceId: string | null, offerId: string | null, fromMs: number, toMs: number): Promise<Window[]> {
  const { data, error } = await supabase.rpc('available_windows', {
    p_seller: sellerId, p_service: serviceId, p_offer: offerId, p_from: new Date(fromMs).toISOString(), p_to: new Date(toMs).toISOString(),
  });
  if (error) return [];
  return ((data ?? []) as { starts_at: string; ends_at: string }[]).map((w) => ({ from: Date.parse(w.starts_at), to: Date.parse(w.ends_at) }));
}

/** Prenotazioni future (da app) che stanno fuori dalla disponibilità attuale. */
export async function bookingsOutsideSchedule(sellerId: string): Promise<number> {
  const { data } = await supabase.rpc('bookings_outside_schedule', { p_seller: sellerId });
  return typeof data === 'number' ? data : 0;
}

/** Quali servizi e offerte del venditore hanno una disponibilità specifica (per l'etichetta nelle liste). */
export async function listSpecificIds(sellerId: string): Promise<{ services: Set<string>; offers: Set<string> }> {
  const { data } = await supabase.from('availability_schedules').select('scope, service_id, offer_id').eq('seller_id', sellerId).neq('scope', 'general');
  const rows = (data ?? []) as { scope: Scope; service_id: string | null; offer_id: string | null }[];
  return {
    services: new Set(rows.filter((r) => r.scope === 'service' && r.service_id).map((r) => r.service_id as string)),
    offers: new Set(rows.filter((r) => r.scope === 'offer' && r.offer_id).map((r) => r.offer_id as string)),
  };
}
