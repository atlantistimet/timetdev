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
  kind: 'slot' | 'package' | 'per_minute';
  sessions: number | null;
  rate_cents_per_min: number | null;
};

export type SellerPlace = { place_type: string | null; place_address: string | null; service_area: string | null; travel_fee_cents: number };

export type OpenSlot = { id: string; starts_at: string; ends_at: string };

export type PaymentIntentInfo = {
  booking_id: string;
  client_secret: string;
  stripe_account: string;
  amount_cents: number;
};

const SERVICE_COLUMNS = 'id, seller_id, title, description, price_cents, duration_min, places, includes, space_fee_cents, cancel_tiers, kind, sessions, rate_cents_per_min';

export async function loadSellerPlace(sellerId: string): Promise<SellerPlace> {
  const { data } = await supabase.from('profiles').select('place_type, place_address, service_area, travel_fee_cents').eq('id', sellerId).maybeSingle();
  return (data as SellerPlace | null) ?? { place_type: null, place_address: null, service_area: null, travel_fee_cents: 0 };
}

/** Servizi a slot attivi di altri venditori. */
export async function listSlotServices(userId: string): Promise<{ services: SlotService[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_COLUMNS)
    .in('kind', ['slot', 'package'])
    .eq('active', true)
    .neq('seller_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { services: [], errorKey: 'errors.generic' };
  return { services: (data ?? []) as SlotService[], errorKey: null };
}

/** Servizi a slot attivi di un venditore, per il suo profilo pubblico. */
export async function listSellerServices(sellerId: string): Promise<SlotService[]> {
  const { data } = await supabase.from('services').select(SERVICE_COLUMNS).eq('seller_id', sellerId).in('kind', ['slot', 'package', 'per_minute']).eq('active', true).order('position').order('created_at');
  return (data ?? []) as SlotService[];
}

export async function loadSlotService(id: string): Promise<SlotService | null> {
  const { data } = await supabase.from('services').select(SERVICE_COLUMNS).eq('id', id).in('kind', ['slot', 'package', 'per_minute']).maybeSingle();
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

/** Link a orario preciso: l'unico slot, se è nel futuro e il venditore non è già occupato. */
export async function loadExactSlot(sellerId: string, startsAt: string, durationMin: number): Promise<OpenSlot[]> {
  const start = new Date(startsAt).getTime();
  const end = start + durationMin * 60_000;
  if (start <= Date.now()) return [];
  const { data } = await supabase.rpc('seller_busy', { p_seller: sellerId, p_from: new Date(start).toISOString(), p_to: new Date(end).toISOString() });
  if (((data ?? []) as unknown[]).length > 0) return [];
  return [{ id: String(start), starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }];
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
  'wrong_session_count',
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

/** Compra un pacchetto: tutte le sessioni scelte, un solo pagamento. */
export async function createPackagePayment(input: {
  serviceId: string;
  startsAt: string[];
  place: 'online' | 'sede' | 'domicilio';
  clientAddress?: string;
}): Promise<{ payment: { client_secret: string; stripe_account: string; amount_cents: number } | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ client_secret: string; stripe_account: string; amount_cents: number }>('create-package-payment', {
    body: { service_id: input.serviceId, starts_at: input.startsAt, place: input.place, client_address: input.clientAddress },
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
  ends_at: string;
  place: 'online' | 'sede' | 'domicilio';
  client_address: string | null;
  extra_cents: number;
  client_name: string | null;
  seller_name: string | null;
  package_id: string | null;
};

/** Prenotazioni dell'utente, fatte o ricevute (la policy di lettura mostra solo quelle in cui è coinvolto). */
export async function listMyBookings(): Promise<{ bookings: MyBooking[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, client_id, seller_id, service_title, starts_at, ends_at, status, price_cents, refund_cents, place, client_address, extra_cents, package_id, client:profiles!bookings_client_id_fkey(full_name), seller:profiles!bookings_seller_id_fkey(full_name)',
    )
    .order('starts_at', { ascending: false })
    .limit(100);
  if (error) return { bookings: [], errorKey: 'errors.generic' };
  const rows = (data ?? []) as unknown as (Omit<MyBooking, 'client_name' | 'seller_name'> & { client: { full_name: string } | null; seller: { full_name: string } | null })[];
  return {
    bookings: rows.map(({ client, seller, ...b }) => ({ ...b, client_name: client?.full_name ?? null, seller_name: seller?.full_name ?? null })),
    errorKey: null,
  };
}

/** Il venditore segna una sessione finita come conclusa o come assente (nessun rimborso). */
export async function markBookingOutcome(bookingId: string, outcome: 'completed' | 'no_show'): Promise<string | null> {
  const { error } = await supabase.rpc('mark_booking_outcome', { p_booking: bookingId, p_outcome: outcome });
  if (!error) return null;
  return error.message.includes('not_finished') ? 'bookings.errors.not_finished' : 'errors.generic';
}
