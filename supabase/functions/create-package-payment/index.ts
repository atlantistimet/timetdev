// Compra un pacchetto di sessioni e prepara UN solo pagamento (addebito diretto sull'account del venditore).
// Corpo: { service_id, starts_at: string[] (tante quante le sessioni del pacchetto), place, client_address? }
// Il prezzo del pacchetto (services.price_cents) è il totale per tutte le sessioni; ogni sessione ha la sua quota.
// Trasferta o costo dello spazio si pagano per ogni sessione. Le commissioni si calcolano sul totale.
// Nascono N prenotazioni "confirmed" con lo stesso package_id (il vincolo del database impedisce le sovrapposizioni).
// Se anche una sola non si può prenotare, si annullano tutte. Risposta: { package_id, client_secret, stripe_account, amount_cents }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { bookingFees } from '../_shared/fees.ts';
import { STANDARD_TIERS } from '../_shared/cancel.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

type PI = { id: string; client_secret: string };

/** Divide un importo in n parti intere: la differenza va alle prime. */
const split = (total: number, n: number): number[] => Array.from({ length: n }, (_, i) => Math.floor(total / n) + (i < total % n ? 1 : 0));

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

  const body = (await req.json().catch(() => ({}))) as { service_id?: string; starts_at?: string[]; place?: string; client_address?: string };
  const starts = Array.isArray(body.starts_at) ? body.starts_at.map((s) => new Date(s)) : [];
  if (!body.service_id || starts.length === 0 || starts.some((d) => Number.isNaN(d.getTime())) || !['online', 'sede', 'domicilio'].includes(body.place ?? '')) {
    return json({ error: 'bad_request' }, 400);
  }
  const place = body.place as 'online' | 'sede' | 'domicilio';
  if (starts.some((d) => d.getTime() < Date.now())) return json({ error: 'in_the_past' }, 400);
  if (place === 'domicilio' && !body.client_address?.trim()) return json({ error: 'address_required' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: me } = await admin.from('profiles').select('adult_confirmed_at').eq('id', user.id).maybeSingle();
  if (!me?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  const { data: service } = await admin
    .from('services')
    .select('id, seller_id, kind, title, price_cents, duration_min, sessions, places, active, cancel_tiers, space_fee_cents')
    .eq('id', body.service_id)
    .maybeSingle();
  if (!service || !service.active) return json({ error: 'service_not_found' }, 404);
  if (service.kind !== 'package') return json({ error: 'unsupported_service_kind' }, 400);
  if (service.seller_id === user.id) return json({ error: 'own_service' }, 400);
  if (!(service.places as string[]).includes(place)) return json({ error: 'place_not_offered' }, 400);
  const sessions = service.sessions as number;
  if (starts.length !== sessions) return json({ error: 'wrong_session_count' }, 400);
  const durationMin = service.duration_min as number;
  const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
  for (let i = 1; i < sorted.length; i++) if (sorted[i].getTime() < sorted[i - 1].getTime() + durationMin * 60_000) return json({ error: 'slot_unavailable' }, 409);

  const [{ data: seller }, { data: account }, { data: policy }] = await Promise.all([
    admin.from('profiles').select('is_pro, travel_fee_cents, place_address').eq('id', service.seller_id).single(),
    admin.from('stripe_accounts').select('stripe_account_id, charges_enabled').eq('seller_id', service.seller_id).maybeSingle(),
    admin.from('cancel_policies').select('tiers').eq('seller_id', service.seller_id).eq('is_default', true).maybeSingle(),
  ]);
  if (!account?.charges_enabled) return json({ error: 'seller_not_ready' }, 409);
  // ogni sessione deve stare in una finestra continua della disponibilità del servizio (o generale), non chiusa e non occupata
  for (const s of sorted) {
    const { data: covered, error: coverError } = await admin.rpc('schedule_covers', {
      p_seller: service.seller_id, p_service: service.id, p_offer: null,
      p_start: s.toISOString(), p_end: new Date(s.getTime() + durationMin * 60_000).toISOString(), p_subtract_busy: true,
    });
    if (coverError) { console.error('schedule_covers', coverError); return json({ error: 'server_error' }, 500); }
    if (!covered) return json({ error: 'slot_unavailable' }, 409);
  }
  if (place === 'sede' && !seller!.place_address) return json({ error: 'place_not_offered' }, 400);

  const extraEach = place === 'domicilio' ? seller!.travel_fee_cents : place === 'sede' ? service.space_fee_cents : 0;
  const baseTotal = service.price_cents! + extraEach * sessions;
  const fees = bookingFees(baseTotal, seller!.is_pro);
  const priceParts = split(service.price_cents!, sessions);
  const clientFeeParts = split(fees.clientFeeCents, sessions);
  const sellerFeeParts = split(fees.sellerFeeCents, sessions);
  const packageId = crypto.randomUUID();
  const tiers = service.cancel_tiers ?? policy?.tiers ?? STANDARD_TIERS;

  const created: string[] = [];
  const undo = () => admin.from('bookings').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id }).eq('package_id', packageId);
  for (let i = 0; i < sorted.length; i++) {
    const startsAt = sorted[i];
    const { data: booking, error } = await admin.from('bookings').insert({
      client_id: user.id, seller_id: service.seller_id, service_id: service.id, service_title: service.title,
      starts_at: startsAt.toISOString(), ends_at: new Date(startsAt.getTime() + durationMin * 60_000).toISOString(), place,
      client_address: place === 'domicilio' ? body.client_address!.trim() : null,
      price_cents: priceParts[i], extra_cents: extraEach,
      client_fee_cents: clientFeeParts[i], seller_fee_cents: sellerFeeParts[i],
      cancel_tiers: tiers, source: 'app', package_id: packageId,
    }).select('id').single();
    if (error) {
      await undo();
      return error.code === '23P01' ? json({ error: 'slot_unavailable' }, 409) : json({ error: 'server_error' }, 500);
    }
    created.push(booking.id);
  }

  try {
    const pi = await stripeRequest<PI>('POST', '/v1/payment_intents', {
      amount: fees.totalChargeCents,
      currency: 'eur',
      application_fee_amount: fees.applicationFeeCents,
      automatic_payment_methods: { enabled: true },
      description: `${service.title} (${sessions} sessioni)`,
      metadata: { package_id: packageId, payer_id: user.id, seller_id: service.seller_id },
    }, { idempotencyKey: `timeet-package-${packageId}`, stripeAccount: account.stripe_account_id });

    const { error: payError } = await admin.from('payments').insert({
      payer_id: user.id, seller_id: service.seller_id, stripe_account_id: account.stripe_account_id,
      stripe_payment_intent_id: pi.id, status: 'pending', amount_cents: fees.totalChargeCents,
      application_fee_cents: fees.applicationFeeCents, package_id: packageId,
    });
    if (payError) throw payError;

    return json({ package_id: packageId, client_secret: pi.client_secret, stripe_account: account.stripe_account_id, amount_cents: fees.totalChargeCents });
  } catch (error) {
    await undo();
    if (error instanceof StripeError) {
      const detail = (error.body as { error?: { code?: string; message?: string } })?.error;
      console.error('Errore Stripe', JSON.stringify(error.body));
      return json({ error: 'stripe_error', code: detail?.code ?? null, message: detail?.message ?? null }, 502);
    }
    console.error('Errore imprevisto', error);
    return json({ error: 'server_error' }, 500);
  }
});
