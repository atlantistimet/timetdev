import { FunctionsHttpError } from '@supabase/supabase-js';
import { type Tier } from '@/lib/cancel-policy';
import { type Place } from '@/lib/my-services';
import { bookableStarts } from '@/lib/slots';
import { supabase } from '@/lib/supabase';

export type SlotService = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  duration_min: number;
  places: Place[];
  includes: string[];
  space_fee_cents: number;
  cancel_tiers: Tier[] | null;
};

export type SellerPlace = { place_type: string | null; place_address: string | null; service_area: string | null; travel_fee_cents: number };

export type OpenSlot = { id: string; starts_at: string; ends_at: string };

export type PaymentIntentInfo = {
  booking_id: string;
  client_secret: string;
  stripe_account: string;
  amount_cents: number;
};

const SERVICE_COLUMNS = 'id, seller_id, title, description, price_cents, duration_min, places, includes, space_fee_cents, cancel_tiers';

export async function loadSellerPlace(sellerId: string): Promise<SellerPlace> {
  const { data } = await supabase.from('profiles').select('place_type, place_address, service_area, travel_fee_cents').eq('id', sellerId).maybeSingle();
  return (data as SellerPlace | null) ?? { place_type: null, place_address: null, service_area: null, travel_fee_cents: 0 };
}

/** Servizi a slot attivi di altri venditori. */
export async function listSlotServices(userId: string): Promise<{ services: SlotService[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_COLUMNS)
    .eq('kind', 'slot')
    .eq('active', true)
    .neq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { services: [], errorKey: 'errors.generic' };
  return { services: (data ?? []) as SlotService[], errorKey: null };
}

export async function loadSlotService(id: string): Promise<SlotService | null> {
  const { data } = await supabase.from('services').select(SERVICE_COLUMNS).eq('id', id).eq('kind', 'slot').maybeSingle();
  return (data as SlotService | null) ?? null;
}

/** Orari prenotabili del venditore nei prossimi 30 giorni: coperti da ore aperte per tutta la durata e non già occupati. */
export async function loadOpenSlots(sellerId: string, durationMin: number): Promise<OpenSlot[]> {
  const now = Date.now();
  const to = new Date(now + 30 * 86_400_000).toISOString();
  const [slots, busy] = await Promise.all([
    supabase
      .from('availability_slots')
      .select('starts_at, ends_at')
      .eq('seller_id', sellerId)
      .eq('status', 'open')
      .gt('ends_at', new Date(now).toISOString())
      .lt('starts_at', to),
    supabase.rpc('seller_busy', { p_seller: sellerId, p_from: new Date(now).toISOString(), p_to: to }),
  ]);
  const open = ((slots.data ?? []) as { starts_at: string; ends_at: string }[]).map((r) => ({ from: new Date(r.starts_at).getTime(), to: new Date(r.ends_at).getTime() }));
  const busyList = ((busy.data ?? []) as { starts_at: string; ends_at: string }[]).map((r) => ({ from: new Date(r.starts_at).getTime(), to: new Date(r.ends_at).getTime() }));
  return bookableStarts(open, busyList, durationMin, now)
    .slice(0, 60)
    .map((ms) => ({ id: String(ms), starts_at: new Date(ms).toISOString(), ends_at: new Date(ms + durationMin * 60_000).toISOString() }));
}

const KNOWN_ERRORS = [
  'adult_required',
  'slot_unavailable',
  'seller_not_ready',
  'service_not_found',
  'own_service',
  'in_the_past',
  'place_not_offered',
  'address_required',
  'unsupported_service_kind',
  'offer_not_valid',
  'offer_not_found',
  'link_not_found',
];

/** Prenota lo slot e prepara il pagamento sull'account del venditore. */
export async function createBookingPayment(input: {
  serviceId?: string;
  code?: string;
  startsAt: string;
  place: 'online' | 'sede' | 'domicilio';
  clientAddress?: string;
  offerId?: string;
}): Promise<{ payment: PaymentIntentInfo | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<PaymentIntentInfo>('create-booking-payment', {
    body: { service_id: input.serviceId, code: input.code, starts_at: input.startsAt, place: input.place, client_address: input.clientAddress, offer_id: input.offerId },
  });
  if (!error && data) return { payment: data, errorKey: null };
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error && KNOWN_ERRORS.includes(body.error)) return { payment: null, errorKey: `book.errors.${body.error}` };
  }
  return { payment: null, errorKey: 'errors.generic' };
}

export function formatEuro(cents: number, language: string): string {
  return (cents / 100).toLocaleString(language, { style: 'currency', currency: 'EUR' });
}

export type MyBooking = {
  id: string;
  client_id: string;
  seller_id: string;
  service_title: string;
  starts_at: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  price_cents: number;
  refund_cents: number;
};

/** Prenotazioni dell'utente, fatte o ricevute (la policy di lettura mostra solo quelle in cui è coinvolto). */
export async function listMyBookings(): Promise<{ bookings: MyBooking[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, client_id, seller_id, service_title, starts_at, status, price_cents, refund_cents')
    .order('starts_at', { ascending: false })
    .limit(50);
  if (error) return { bookings: [], errorKey: 'errors.generic' };
  return { bookings: (data ?? []) as MyBooking[], errorKey: null };
}
