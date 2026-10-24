// Prenota uno slot e prepara il pagamento (addebito diretto sull'account Stripe del venditore).
// Corpo: { service_id, starts_at (ISO), place: 'online'|'sede'|'domicilio', client_address?, offer_id? }
// In alternativa a service_id: { code, ... } per prenotare da un link "Invia slot" (prezzo, durata, luoghi, giorni e fasce del link).
// Con offer_id vale il prezzo scontato e la durata dell'offerta, se lo slot rientra nella sua validità.
// Risposta: { booking_id, client_secret, stripe_account, amount_cents }
// Il prezzo, le commissioni e l'orario si leggono dal database: dal client si fidano solo gli identificativi.
// La prenotazione nasce "confirmed" (il vincolo del database impedisce le sovrapposizioni) e viene annullata
// se il pagamento non parte o fallisce (webhook).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { bookingFees } from '../_shared/fees.ts';
import { STANDARD_TIERS } from '../_shared/cancel.ts';
import { isCovered } from '../_shared/slots.ts';
import { discountedCents, offerApplies, type Validity } from '../_shared/validity.ts';
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

  const body = (await req.json().catch(() => ({}))) as { service_id?: string; starts_at?: string; place?: string; client_address?: string; offer_id?: string; code?: string };
  let startsAt = body.starts_at ? new Date(body.starts_at) : null;
  if ((!body.service_id && !body.code) || !startsAt || Number.isNaN(startsAt.getTime()) || !['online', 'sede', 'domicilio'].includes(body.place ?? '')) {
    return json({ error: 'bad_request' }, 400);
  }
  const place = body.place as 'online' | 'sede' | 'domicilio';
  if (startsAt.getTime() < Date.now()) return json({ error: 'in_the_past' }, 400);
  if (place === 'domicilio' && !body.client_address?.trim()) return json({ error: 'address_required' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: me } = await admin.from('profiles').select('adult_confirmed_at').eq('id', user.id).maybeSingle();
  if (!me?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  type Link = {
    id: string; service_id: string | null; price_cents: number; duration_min: number; discount_pct: number;
    days: string[]; ranges: { from: string; to: string }[]; places: string[]; extra_space_cents: number; extra_travel_cents: number; seller_id: string; starts_at: string | null;
  };
  let link: Link | null = null;
  if (body.code) {
    if (body.offer_id) return json({ error: 'bad_request' }, 400);
    const { data } = await admin
      .from('slot_links')
      .select('id, seller_id, service_id, price_cents, duration_min, discount_pct, days, ranges, places, extra_space_cents, extra_travel_cents, starts_at, expires_at')
      .eq('code', body.code)
      .maybeSingle();
    if (!data || !data.service_id || (data.expires_at && new Date(data.expires_at).getTime() < Date.now())) return json({ error: 'link_not_found' }, 404);
    link = data as Link;
  }

  const { data: service } = await admin
    .from('services')
    .select('id, seller_id, kind, title, price_cents, duration_min, places, active, cancel_tiers, space_fee_cents')
    .eq('id', link ? link.service_id! : body.service_id!)
    .maybeSingle();
  if (!service || !service.active) return json({ error: 'service_not_found' }, 404);
  if (service.kind !== 'slot') return json({ error: 'unsupported_service_kind' }, 400); // pacchetti e chiamate: funzioni a parte
  if (service.seller_id === user.id) return json({ error: 'own_service' }, 400);
  if (link && link.seller_id !== service.seller_id) return json({ error: 'link_not_found' }, 404);
  if (!(service.places as string[]).includes(place)) return json({ error: 'place_not_offered' }, 400);
  if (link && !link.places.includes(place)) return json({ error: 'place_not_offered' }, 400);

  let priceCents = service.price_cents!;
  let durationMin = service.duration_min!;
  let offerTiers: unknown = null;
  if (body.offer_id) {
    const { data: offer } = await admin
      .from('offers')
      .select('id, service_id, seller_id, price_cents, duration_min, discount_pct, validity, active, cancel_tiers')
      .eq('id', body.offer_id)
      .maybeSingle();
    if (!offer || !offer.active || offer.service_id !== service.id || offer.seller_id !== service.seller_id) {
      return json({ error: 'offer_not_found' }, 404);
    }
    const offerEnd = new Date(startsAt.getTime() + offer.duration_min * 60_000);
    if (!offerApplies(offer.validity as Validity, startsAt, offerEnd)) return json({ error: 'offer_not_valid' }, 409);
    priceCents = discountedCents(offer.price_cents, offer.discount_pct);
    durationMin = offer.duration_min;
    offerTiers = offer.cancel_tiers;
  }

  if (link) {
    priceCents = discountedCents(link.price_cents, link.discount_pct);
    durationMin = link.duration_min;
    if (link.starts_at) {
      // link con un solo orario preciso (anche immediato): si prenota solo quell'istante
      if (Math.abs(new Date(link.starts_at).getTime() - startsAt.getTime()) > 60_000) return json({ error: 'slot_unavailable' }, 409);
      startsAt = new Date(link.starts_at);
    } else {
      const linkEnd = new Date(startsAt.getTime() + durationMin * 60_000);
      const linkValidity: Validity = { modes: ['giorni', 'orari'], days: link.days, from: '', to: '', wdays: [], ranges: link.ranges };
      if (!offerApplies(linkValidity, startsAt, linkEnd)) return json({ error: 'slot_unavailable' }, 409);
    }
  }

  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

  const [{ data: seller }, { data: account }, { data: window }, { data: policy }] = await Promise.all([
    admin.from('profiles').select('is_pro, travel_fee_cents, place_address').eq('id', service.seller_id).single(),
    admin.from('stripe_accounts').select('stripe_account_id, charges_enabled').eq('seller_id', service.seller_id).maybeSingle(),
    // lo slot richiesto deve essere coperto senza buchi dalle ore aperte del venditore
    admin.from('availability_slots').select('starts_at, ends_at').eq('seller_id', service.seller_id).eq('status', 'open')
      .lt('starts_at', endsAt.toISOString()).gt('ends_at', startsAt.toISOString()),
    // fasce proprie dell'offerta, altrimenti policy predefinita del venditore (se non ne ha, vale la standard)
    admin.from('cancel_policies').select('tiers').eq('seller_id', service.seller_id).eq('is_default', true).maybeSingle(),
  ]);
  if (!account?.charges_enabled) return json({ error: 'seller_not_ready' }, 409);
  const openRanges = (window ?? []).map((r) => ({ from: new Date(r.starts_at).getTime(), to: new Date(r.ends_at).getTime() }));
  // con un link a orario preciso lo propone il venditore: non serve che l'ora sia aperta nel calendario
  if (!link?.starts_at && !isCovered(openRanges, startsAt.getTime(), endsAt.getTime())) return json({ error: 'slot_unavailable' }, 409);

  if (place === 'sede' && !seller!.place_address) return json({ error: 'place_not_offered' }, 400);
  // costi aggiuntivi: trasferta (profilo) a domicilio, spazio (servizio) nel luogo del venditore
  const extraCents = link
    ? place === 'domicilio' ? link.extra_travel_cents : place === 'sede' ? link.extra_space_cents : 0
    : place === 'domicilio' ? seller!.travel_fee_cents : place === 'sede' ? service.space_fee_cents : 0;
  const fees = bookingFees(priceCents + extraCents, seller!.is_pro);

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      client_id: user.id, seller_id: service.seller_id, service_id: service.id, service_title: service.title,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), place,
      client_address: place === 'domicilio' ? body.client_address!.trim() : null,
      price_cents: priceCents, extra_cents: extraCents,
      client_fee_cents: fees.clientFeeCents, seller_fee_cents: fees.sellerFeeCents,
      cancel_tiers: offerTiers ?? service.cancel_tiers ?? policy?.tiers ?? STANDARD_TIERS, source: link ? 'link' : 'app', slot_link_id: link?.id ?? null,
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
