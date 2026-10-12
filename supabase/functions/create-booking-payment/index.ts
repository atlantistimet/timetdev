// Prenota uno slot e prepara il pagamento (addebito diretto sull'account Stripe del venditore).
// Corpo: { service_id, starts_at (ISO), place: 'online'|'sede'|'domicilio', client_address? }
// Risposta: { booking_id, client_secret, stripe_account, amount_cents }
// Il prezzo, le commissioni e l'orario si leggono dal database: dal client si fidano solo gli identificativi.
// La prenotazione nasce "confirmed" (il vincolo del database impedisce le sovrapposizioni) e viene annullata
// se il pagamento non parte o fallisce (webhook).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { bookingFees } from '../_shared/fees.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

type PI = { id: string; client_secret: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  const body = (await req.json().catch(() => ({}))) as { service_id?: string; starts_at?: string; place?: string; client_address?: string };
  const startsAt = body.starts_at ? new Date(body.starts_at) : null;
  if (!body.service_id || !startsAt || Number.isNaN(startsAt.getTime()) || !['online', 'sede', 'domicilio'].includes(body.place ?? '')) {
    return json({ error: 'bad_request' }, 400);
  }
  const place = body.place as 'online' | 'sede' | 'domicilio';
  if (startsAt.getTime() < Date.now()) return json({ error: 'in_the_past' }, 400);
  if (place === 'domicilio' && !body.client_address?.trim()) return json({ error: 'address_required' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: me } = await admin.from('profiles').select('adult_confirmed_at').eq('id', user.id).maybeSingle();
  if (!me?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  const { data: service } = await admin
    .from('services')
    .select('id, seller_id, kind, title, price_cents, duration_min, places, active')
    .eq('id', body.service_id)
    .maybeSingle();
  if (!service || !service.active) return json({ error: 'service_not_found' }, 404);
  if (service.kind !== 'slot') return json({ error: 'unsupported_service_kind' }, 400); // pacchetti e chiamate: funzioni a parte
  if (service.seller_id === user.id) return json({ error: 'own_service' }, 400);
  if (!(service.places as string[]).includes(place)) return json({ error: 'place_not_offered' }, 400);

  const endsAt = new Date(startsAt.getTime() + service.duration_min! * 60_000);

  const [{ data: seller }, { data: account }, { data: window }] = await Promise.all([
    admin.from('profiles').select('is_pro, cancel_policy, travel_fee_cents').eq('id', service.seller_id).single(),
    admin.from('stripe_accounts').select('stripe_account_id, charges_enabled').eq('seller_id', service.seller_id).maybeSingle(),
    // lo slot richiesto deve stare dentro una disponibilità aperta del venditore
    admin.from('availability_slots').select('id').eq('seller_id', service.seller_id).eq('status', 'open')
      .lte('starts_at', startsAt.toISOString()).gte('ends_at', endsAt.toISOString()).limit(1),
  ]);
  if (!account?.charges_enabled) return json({ error: 'seller_not_ready' }, 409);
  if (!window?.length) return json({ error: 'slot_unavailable' }, 409);

  const extraCents = place === 'domicilio' ? seller!.travel_fee_cents : 0;
  const fees = bookingFees(service.price_cents! + extraCents, seller!.is_pro);

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      client_id: user.id, seller_id: service.seller_id, service_id: service.id, service_title: service.title,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), place,
      client_address: place === 'domicilio' ? body.client_address!.trim() : null,
      price_cents: service.price_cents, extra_cents: extraCents,
      client_fee_cents: fees.clientFeeCents, seller_fee_cents: fees.sellerFeeCents,
      cancel_policy: seller!.cancel_policy, source: 'app',
    })
    .select('id')
    .single();
  if (bookingError) {
    // 23P01 = vincolo di esclusione: lo slot è già stato preso da qualcun altro
    return bookingError.code === '23P01' ? json({ error: 'slot_unavailable' }, 409) : json({ error: 'server_error' }, 500);
  }

  try {
    const pi = await stripeRequest<PI>('POST', '/v1/payment_intents', {
      amount: fees.totalChargeCents,
      currency: 'eur',
      application_fee_amount: fees.applicationFeeCents,
      automatic_payment_methods: { enabled: true },
      description: service.title,
      metadata: { booking_id: booking.id, payer_id: user.id, seller_id: service.seller_id },
    }, { idempotencyKey: `timeet-booking-${booking.id}`, stripeAccount: account.stripe_account_id });

    const { error: payError } = await admin.from('payments').insert({
      payer_id: user.id, seller_id: service.seller_id, stripe_account_id: account.stripe_account_id,
      stripe_payment_intent_id: pi.id, status: 'pending', amount_cents: fees.totalChargeCents,
      application_fee_cents: fees.applicationFeeCents, booking_id: booking.id,
    });
    if (payError) throw payError;

    return json({ booking_id: booking.id, client_secret: pi.client_secret, stripe_account: account.stripe_account_id, amount_cents: fees.totalChargeCents });
  } catch (error) {
    // Il pagamento non è partito: libera lo slot.
    await admin.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id }).eq('id', booking.id);
    if (error instanceof StripeError) {
      const detail = (error.body as { error?: { code?: string; message?: string } })?.error;
      console.error('Errore Stripe', JSON.stringify(error.body));
      return json({ error: 'stripe_error', code: detail?.code ?? null, message: detail?.message ?? null }, 502);
    }
    console.error('Errore imprevisto', error);
    return json({ error: 'server_error' }, 500);
  }
});
