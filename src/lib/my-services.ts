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
};

export type Place = 'online' | 'sede' | 'domicilio';
export const PLACES: Place[] = ['online', 'sede', 'domicilio'];

const COLUMNS = 'id, title, description, price_cents, duration_min, active, cancel_tiers, places, includes, space_fee_cents';

/** Servizi a slot del venditore (anche quelli in pausa). */
export async function listMyServices(sellerId: string): Promise<{ services: MyService[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .select(COLUMNS)
    .eq('seller_id', sellerId)
    .eq('kind', 'slot')
    .order('created_at', { ascending: false });
  if (error) return { services: [], errorKey: 'errors.generic' };
  return { services: (data ?? []) as MyService[], errorKey: null };
}

export async function loadMyService(id: string): Promise<MyService | null> {
  const { data } = await supabase.from('services').select(COLUMNS).eq('id', id).eq('kind', 'slot').maybeSingle();
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
}): Promise<string | null> {
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
  };
  const { error } = input.id
    ? await supabase.from('services').update(row).eq('id', input.id)
    : await supabase.from('services').insert({ ...row, seller_id: input.sellerId, kind: 'slot' });
  return error ? 'errors.generic' : null;
}
