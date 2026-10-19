import { type Tier } from '@/lib/cancel-policy';
import { supabase } from '@/lib/supabase';
import { discountedCents, type Validity } from '@/lib/validity';

export type Offer = {
  id: string;
  service_id: string;
  seller_id: string;
  price_cents: number;
  duration_min: number;
  discount_pct: number;
  validity: Validity;
  message: string | null;
  active: boolean;
  cancel_tiers: Tier[] | null;
  service_title: string;
};

const COLUMNS = 'id, service_id, seller_id, price_cents, duration_min, discount_pct, validity, message, active, cancel_tiers, services(title)';

type Row = Omit<Offer, 'service_title'> & { services: { title: string } | { title: string }[] | null };

const toOffer = (row: Row): Offer => {
  const { services, ...rest } = row;
  const service = Array.isArray(services) ? services[0] : services;
  return { ...rest, service_title: service?.title ?? '' };
};

export const finalPriceCents = (offer: Pick<Offer, 'price_cents' | 'discount_pct'>) => discountedCents(offer.price_cents, offer.discount_pct);

export async function listMyOffers(sellerId: string): Promise<{ offers: Offer[]; errorKey: string | null }> {
  const { data, error } = await supabase.from('offers').select(COLUMNS).eq('seller_id', sellerId).order('created_at', { ascending: false });
  if (error) return { offers: [], errorKey: 'errors.generic' };
  return { offers: ((data ?? []) as unknown as Row[]).map(toOffer), errorKey: null };
}

export async function loadOffer(id: string): Promise<Offer | null> {
  const { data } = await supabase.from('offers').select(COLUMNS).eq('id', id).maybeSingle();
  return data ? toOffer(data as unknown as Row) : null;
}

/** Offerte attive di altri venditori, visibili a chi cerca. */
export async function listPublicOffers(userId: string): Promise<{ offers: Offer[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('offers')
    .select(`${COLUMNS.replace('services(title)', 'services!inner(title, active)')}`)
    .eq('active', true)
    .eq('services.active', true)
    .neq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { offers: [], errorKey: 'errors.generic' };
  return { offers: ((data ?? []) as unknown as Row[]).map(toOffer), errorKey: null };
}

/** Offerte attive di un venditore, per il suo profilo pubblico. */
export async function listSellerOffers(sellerId: string): Promise<Offer[]> {
  const { data } = await supabase
    .from('offers')
    .select(`${COLUMNS.replace('services(title)', 'services!inner(title, active)')}`)
    .eq('seller_id', sellerId)
    .eq('active', true)
    .eq('services.active', true)
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as Row[]).map(toOffer);
}

export async function saveOffer(input: {
  id: string | null;
  sellerId: string;
  serviceId: string;
  priceCents: number;
  durationMin: number;
  discountPct: number;
  validity: Validity;
  message: string;
  active: boolean;
  cancelTiers: Tier[] | null;
}): Promise<{ id: string | null; errorKey: string | null }> {
  const row = {
    service_id: input.serviceId,
    price_cents: input.priceCents,
    duration_min: input.durationMin,
    discount_pct: input.discountPct,
    validity: input.validity,
    message: input.message.trim() || null,
    active: input.active,
    cancel_tiers: input.cancelTiers,
  };
  if (input.id) {
    const { error } = await supabase.from('offers').update(row).eq('id', input.id);
    return error ? { id: null, errorKey: 'errors.generic' } : { id: input.id, errorKey: null };
  }
  const { data, error } = await supabase.from('offers').insert({ ...row, seller_id: input.sellerId }).select('id').single();
  return error || !data ? { id: null, errorKey: 'errors.generic' } : { id: data.id as string, errorKey: null };
}

export async function deleteOffer(id: string): Promise<string | null> {
  const { error } = await supabase.from('offers').delete().eq('id', id);
  return error ? 'errors.generic' : null;
}

/** Descrizione leggibile della validità ("martedì, giovedì · dalle 09:00 alle 13:00"). */
export function validityText(v: Validity, language: string, t: (key: string) => string): string {
  const parts: string[] = [];
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
  };
  if (v.modes.includes('giorni') && v.days.length) parts.push([...v.days].sort().map(day).join(', '));
  if (v.modes.includes('periodo') && (v.from || v.to)) {
    parts.push(v.from && v.to ? `${day(v.from)} – ${day(v.to)}` : v.from ? `${t('offers.from')} ${day(v.from)}` : `${t('offers.until')} ${day(v.to)}`);
  }
  if (v.modes.includes('settimana') && v.wdays.length) {
    const name = (w: number) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2024, 0, 7 + w));
    parts.push([1, 2, 3, 4, 5, 6, 0].filter((w) => v.wdays.includes(w)).map(name).join(', '));
  }
  if (v.modes.includes('orari') && v.ranges.length) parts.push(v.ranges.map((r) => `${r.from}–${r.to}`).join(' · '));
  return parts.length ? parts.join(' · ') : t('offers.always');
}
