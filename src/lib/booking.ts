import { FunctionsHttpError } from '@supabase/supabase-js';
import { type Tier } from '@/lib/cancel-policy';
import { supabase } from '@/lib/supabase';

export type SlotService = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  duration_min: number;
  places: string[];
  cancel_tiers: Tier[] | null;
};

export type OpenSlot = { id: string; starts_at: string; ends_at: string };

export type PaymentIntentInfo = {
  booking_id: string;
  client_secret: string;
  stripe_account: string;
  amount_cents: number;
};

const SERVICE_COLUMNS = 'id, seller_id, title, description, price_cents, duration_min, places, cancel_tiers';

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

/** Disponibilità aperte e future del venditore, abbastanza lunghe per il servizio. */
export async function loadOpenSlots(sellerId: string, durationMin: number): Promise<OpenSlot[]> {
  const { data } = await supabase
    .from('availability_slots')
    .select('id, starts_at, ends_at')
    .eq('seller_id', sellerId)
    .eq('status', 'open')
    .gt('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(30);
  return ((data ?? []) as OpenSlot[]).filter(
    (slot) => new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime() >= durationMin * 60_000,
  );
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
];

/** Prenota lo slot e prepara il pagamento sull'account del venditore. */
export async function createBookingPayment(input: {
  serviceId: string;
  startsAt: string;
  place: 'online' | 'sede' | 'domicilio';
  clientAddress?: string;
  offerId?: string;
}): Promise<{ payment: PaymentIntentInfo | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<PaymentIntentInfo>('create-booking-payment', {
    body: { service_id: input.serviceId, starts_at: input.startsAt, place: input.place, client_address: input.clientAddress, offer_id: input.offerId },
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
