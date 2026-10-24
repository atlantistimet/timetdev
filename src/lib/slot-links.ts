import { Platform, Share } from 'react-native';
import { type Place } from '@/lib/my-services';
import { romeToDate } from '@/lib/time';
import { localParts } from '@/lib/validity';
import { supabase } from '@/lib/supabase';
import { type Range } from '@/lib/validity';

export type SlotLink = {
  id: string;
  code: string;
  seller_id: string;
  service_id: string | null;
  price_cents: number;
  duration_min: number;
  discount_pct: number;
  days: string[];
  ranges: Range[];
  places: Place[];
  extra_space_cents: number;
  extra_travel_cents: number;
  message: string | null;
  preview_path: string | null;
  preview_type: 'image' | 'video' | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  service_title?: string;
};

const COLUMNS = 'id, code, seller_id, service_id, price_cents, duration_min, discount_pct, days, ranges, places, extra_space_cents, extra_travel_cents, message, preview_path, preview_type, starts_at, expires_at, created_at';

/** Indirizzo da condividere: sul web quello del sito, in app quello pubblico. */
export function linkUrl(code: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/s/${code}`;
  return `https://timeet.world/s/${code}`;
}

export async function listMyLinks(sellerId: string): Promise<{ links: SlotLink[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('slot_links')
    .select(`${COLUMNS}, services(title)`)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { links: [], errorKey: 'errors.generic' };
  const rows = (data ?? []) as unknown as (SlotLink & { services: { title: string } | { title: string }[] | null })[];
  return {
    links: rows.map(({ services, ...rest }) => ({ ...rest, service_title: (Array.isArray(services) ? services[0] : services)?.title ?? '' })),
    errorKey: null,
  };
}

/** Link da codice (funzione del database, solo per utenti autenticati). Null se non esiste o è scaduto. */
export async function loadLinkByCode(code: string): Promise<SlotLink | null> {
  const { data } = await supabase.rpc('slot_link_by_code', { p_code: code });
  const row = ((data ?? []) as SlotLink[])[0];
  return row ?? null;
}

export async function createLink(input: {
  sellerId: string;
  serviceId: string;
  priceCents: number;
  durationMin: number;
  discountPct: number;
  days: string[];
  ranges: Range[];
  places: Place[];
  extraSpaceCents: number;
  extraTravelCents: number;
  message: string;
  preview: { path: string; type: 'image' | 'video' } | null;
  startsAt?: Date | null; // un solo orario preciso (anche subito)
}): Promise<{ link: SlotLink | null; errorKey: string | null }> {
  let days = [...input.days].sort();
  let ranges = input.ranges;
  let expires: Date;
  if (input.startsAt) {
    // orario preciso: un solo giorno, una sola fascia (inizio–fine), il link scade all'inizio della sessione
    const p = localParts(input.startsAt);
    const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    days = [p.date];
    ranges = [{ from: hhmm(p.minutes), to: hhmm(Math.min(p.minutes + input.durationMin, 23 * 60 + 59)) }];
    expires = input.startsAt;
  } else {
    // il link scade a fine dell'ultimo giorno proposto
    expires = romeToDate(days[days.length - 1], '23:59');
  }
  const { data, error } = await supabase
    .from('slot_links')
    .insert({
      seller_id: input.sellerId,
      service_id: input.serviceId,
      price_cents: input.priceCents,
      duration_min: input.durationMin,
      discount_pct: input.discountPct,
      days,
      ranges,
      starts_at: input.startsAt ? input.startsAt.toISOString() : null,
      places: input.places,
      extra_space_cents: input.extraSpaceCents,
      extra_travel_cents: input.extraTravelCents,
      message: input.message.trim() || null,
      preview_path: input.preview?.path ?? null,
      preview_type: input.preview?.type ?? null,
      expires_at: expires.toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return { link: null, errorKey: 'errors.generic' };
  return { link: data as unknown as SlotLink, errorKey: null };
}

export async function deleteLink(id: string): Promise<string | null> {
  const { error } = await supabase.from('slot_links').delete().eq('id', id);
  return error ? 'errors.generic' : null;
}

/** Condivide il testo: foglio di condivisione su telefono, appunti sul web. Restituisce true se è stato copiato. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}
