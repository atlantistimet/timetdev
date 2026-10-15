import { romeToDate } from '@/lib/time';
import { supabase } from '@/lib/supabase';

export const HOURS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const HOUR_MS = 3_600_000;

export type Calendar = { open: Set<number>; busy: { from: number; to: number }[] };

/** Orari aperti e occupati del venditore tra due giorni (AAAA-MM-GG, inclusi). */
export async function loadCalendar(sellerId: string, firstDay: string, lastDay: string): Promise<{ calendar: Calendar | null; errorKey: string | null }> {
  const from = romeToDate(firstDay, '00:00');
  const to = romeToDate(lastDay, '23:59');
  const [slots, busy] = await Promise.all([
    supabase.from('availability_slots').select('starts_at').eq('seller_id', sellerId).eq('status', 'open').gte('starts_at', from.toISOString()).lte('starts_at', to.toISOString()),
    supabase.rpc('seller_busy', { p_seller: sellerId, p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);
  if (slots.error || busy.error) return { calendar: null, errorKey: 'errors.generic' };
  return {
    calendar: {
      open: new Set((slots.data ?? []).map((r: { starts_at: string }) => new Date(r.starts_at).getTime())),
      busy: ((busy.data ?? []) as { starts_at: string; ends_at: string }[]).map((b) => ({ from: new Date(b.starts_at).getTime(), to: new Date(b.ends_at).getTime() })),
    },
    errorKey: null,
  };
}

export const hourStart = (day: string, hhmm: string) => romeToDate(day, hhmm).getTime();
export const isBusy = (calendar: Calendar, start: number) => calendar.busy.some((b) => b.from < start + HOUR_MS && b.to > start);

/** Apre o chiude un insieme di ore (istanti di inizio). */
export async function setHours(sellerId: string, starts: number[], open: boolean): Promise<string | null> {
  if (starts.length === 0) return null;
  if (open) {
    const rows = starts.map((s) => ({ seller_id: sellerId, starts_at: new Date(s).toISOString(), ends_at: new Date(s + HOUR_MS).toISOString(), status: 'open' }));
    const { error } = await supabase.from('availability_slots').upsert(rows, { onConflict: 'seller_id,starts_at' });
    return error ? 'errors.generic' : null;
  }
  const { error } = await supabase.from('availability_slots').delete().eq('seller_id', sellerId).in('starts_at', starts.map((s) => new Date(s).toISOString()));
  return error ? 'errors.generic' : null;
}
