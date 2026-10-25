import { type Tier } from '@/lib/cancel-policy';
import { supabase } from '@/lib/supabase';

export type MyService = {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  duration_min: number;
  active: boolean;
  cancel_tiers: Tier[] | null;
  places: Place[];
  includes: string[];
  space_fee_cents: number;
  kind: 'slot' | 'package' | 'per_minute';
  sessions: number | null;
  rate_cents_per_min: number | null;
};

export type Place = 'online' | 'sede' | 'domicilio';
export const PLACES: Place[] = ['online', 'sede', 'domicilio'];

const COLUMNS = 'id, title, description, price_cents, duration_min, active, cancel_tiers, places, includes, space_fee_cents, kind, sessions, rate_cents_per_min';

/** Servizi del venditore (anche quelli in pausa). Di norma solo a slot: offerte e link non valgono per i pacchetti. */
export async function listMyServices(sellerId: string, kinds: ('slot' | 'package' | 'per_minute')[] = ['slot']): Promise<{ services: MyService[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .select(COLUMNS)
    .eq('seller_id', sellerId)
    .in('kind', kinds)
    .order('created_at', { ascending: false });
  if (error) return { services: [], errorKey: 'errors.generic' };
  return { services: (data ?? []) as MyService[], errorKey: null };
}

export async function loadMyService(id: string): Promise<MyService | null> {
  const { data } = await supabase.from('services').select(COLUMNS).eq('id', id).maybeSingle();
  return (data as MyService | null) ?? null;
}

/** "20", "20,50" o "20.5" → centesimi; null se non valido. */
export function parseEuroToCents(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function centsToEuroText(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

export const MIN_PRICE_CENTS = 100;

export async function saveService(input: {
  id: string | null;
  sellerId: string;
  title: string;
  description: string;
  priceCents: number;
  durationMin: number;
  active: boolean;
  cancelTiers: Tier[] | null;
  places: Place[];
  includes: string[];
  spaceFeeCents: number;
  kind?: 'slot' | 'package' | 'per_minute';
  sessions?: number | null;
  rateCents?: number;
}): Promise<{ errorKey: string | null; id: string | null }> {
  if (input.kind === 'per_minute') {
    const perMinute = {
      title: input.title.trim(), description: input.description.trim() || null, includes: input.includes, active: input.active,
      rate_cents_per_min: input.rateCents ?? null, min_minutes: 5, max_minutes: 60, places: ['online'] as Place[], price_cents: null, duration_min: null, sessions: null, cancel_tiers: null, space_fee_cents: 0,
    };
    const { data, error } = input.id
      ? await supabase.from('services').update(perMinute).eq('id', input.id).select('id').single()
      : await supabase.from('services').insert({ ...perMinute, seller_id: input.sellerId, kind: 'per_minute' }).select('id').single();
    return error || !data ? { errorKey: 'errors.generic', id: null } : { errorKey: null, id: data.id as string };
  }
  const row = {
    title: input.title.trim(),
    description: input.description.trim() || null,
    price_cents: input.priceCents,
    duration_min: input.durationMin,
    active: input.active,
    cancel_tiers: input.cancelTiers,
    places: input.places,
    includes: input.includes,
    space_fee_cents: input.places.includes('sede') ? input.spaceFeeCents : 0,
    sessions: input.kind === 'package' ? input.sessions ?? null : null,
  };
  const { data, error } = input.id
    ? await supabase.from('services').update(row).eq('id', input.id).select('id').single()
    : await supabase.from('services').insert({ ...row, seller_id: input.sellerId, kind: input.kind ?? 'slot' }).select('id').single();
  return error || !data ? { errorKey: 'errors.generic', id: null } : { errorKey: null, id: data.id as string };
}

/** Crea al volo un servizio a slot (da offerta o da link): solo titolo, prezzo, durata e luoghi; il resto si completa dopo da "I miei servizi". */
export async function createQuickService(input: {
  sellerId: string;
  title: string;
  priceCents: number;
  durationMin: number;
  places: Place[];
}): Promise<{ service: MyService | null; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .insert({
      seller_id: input.sellerId,
      kind: 'slot',
      title: input.title.trim(),
      price_cents: input.priceCents,
      duration_min: input.durationMin,
      places: input.places,
      active: true,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return { service: null, errorKey: 'errors.generic' };
  return { service: data as unknown as MyService, errorKey: null };
}
