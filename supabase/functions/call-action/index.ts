// Chiamate al minuto: tutte le azioni dell'utente in un'unica funzione.
// Corpo: { action, ... }
//  - start        { service_id }  il cliente avvia la chiamata: crea il blocco sulla carta (15 min × tariffa) → { call_id, client_secret, stripe_account, amount_cents }
//  - confirm_hold { call_id }     il cliente ha confermato la carta: la chiamata squilla per 60 secondi
//  - accept       { call_id }     il venditore risponde: parte il conteggio dei minuti
//  - decline      { call_id }     il venditore rifiuta (nessun addebito)
//  - cancel       { call_id }     il cliente annulla prima della risposta (nessun addebito)
//  - heartbeat    { call_id }     ogni 10 s da entrambi: presenza, scadenze, prolungamento → stato aggiornato
//  - end          { call_id }     uno dei due chiude: si incassano i minuti usati
//  - token        { call_id }     token LiveKit per entrare nella stanza (solo chiamata attiva)
// Il prezzo, i tempi e le commissioni si leggono sempre dal database: dall'app si fidano solo gli identificativi.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';
import { callBlockFees, CALL_BLOCK_MIN, CALL_MIN_RATE_CENTS, CALL_RING_SECONDS } from '../_shared/fees.ts';
import { CALL_COLUMNS, cancelHolds, closeWithoutCharge, finishCall, tickCall, type CallRow } from '../_shared/calls.ts';
import { livekitConfigured, livekitToken } from '../_shared/livekit.ts';

type PI = { id: string; client_secret: string; status: string };

function publicState(call: CallRow) {
  const started = call.started_at ? Date.parse(call.started_at) : null;
  return {
    call_id: call.id, status: call.status, started_at: call.started_at, ended_at: call.ended_at,
    covered_until: started ? new Date(started + call.blocks_held * CALL_BLOCK_MIN * 60_000).toISOString() : null,
    blocks_held: call.blocks_held, extend_failed: call.extend_failed, ring_expires_at: call.ring_expires_at,
  };
}

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
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = (await req.json().catch(() => ({}))) as { action?: string; service_id?: string; call_id?: string };

  try {
    if (body.action === 'start') return await start(admin, user.id, user.email ?? undefined, body.service_id);

    if (!body.call_id) return json({ error: 'bad_request' }, 400);
    const { data: found } = await admin.from('calls').select(CALL_COLUMNS).eq('id', body.call_id).maybeSingle();
    const call = found as CallRow | null;
    if (!call || (call.client_id !== user.id && call.seller_id !== user.id)) return json({ error: 'not_found' }, 404);
    const isClient = call.client_id === user.id;
    const now = new Date().toISOString();

    switch (body.action) {
      case 'confirm_hold': {
        if (!isClient) return json({ error: 'forbidden' }, 403);
        if (call.status !== 'awaiting_payment') return json(publicState(call));
        const { data: pay } = await admin.from('payments').select('id, stripe_payment_intent_id, stripe_account_id').eq('call_id', call.id).eq('call_block', 0).single();
        if (!pay) return json({ error: 'server_error' }, 500);
        const pi = await stripeRequest<PI>('GET', `/v1/payment_intents/${pay.stripe_payment_intent_id}`, undefined, { stripeAccount: pay.stripe_account_id });
        if (pi.status !== 'requires_capture') return json({ error: 'not_authorized' }, 409);
        await admin.from('payments').update({ status: 'authorized' }).eq('id', pay.id);
        const { data: up, error } = await admin.from('calls').update({
          status: 'ringing', blocks_held: 1, ring_expires_at: new Date(Date.now() + CALL_RING_SECONDS * 1000).toISOString(), last_seen_client: now,
        }).eq('id', call.id).eq('status', 'awaiting_payment').select(CALL_COLUMNS).maybeSingle();
        if (error) { // indice unico: il venditore ha già una chiamata in corso
          await closeWithoutCharge(admin, call, 'cancelled');
          return json({ error: error.code === '23505' ? 'seller_busy' : 'server_error' }, error.code === '23505' ? 409 : 500);
        }
        return json(publicState((up ?? call) as CallRow));
      }
      case 'accept': {
        if (isClient) return json({ error: 'forbidden' }, 403);
        if (call.status !== 'ringing' || Date.now() > Date.parse(call.ring_expires_at ?? '')) return json({ error: 'not_ringing' }, 409);
        const { data: up } = await admin.from('calls').update({ status: 'active', started_at: now, last_seen_seller: now, last_seen_client: now, livekit_room: `call-${call.id}` })
          .eq('id', call.id).eq('status', 'ringing').select(CALL_COLUMNS).maybeSingle();
        if (!up) return json({ error: 'not_ringing' }, 409);
        return json(publicState(up as CallRow));
      }
      case 'decline': {
        if (isClient) return json({ error: 'forbidden' }, 403);
        if (call.status === 'ringing') await closeWithoutCharge(admin, call, 'declined');
        break;
      }
      case 'cancel': {
        if (!isClient) return json({ error: 'forbidden' }, 403);
        if (call.status === 'awaiting_payment' || call.status === 'ringing') await closeWithoutCharge(admin, call, 'cancelled');
        break;
      }
      case 'heartbeat': {
        if (['awaiting_payment', 'ringing', 'active'].includes(call.status)) {
          await admin.from('calls').update(isClient ? { last_seen_client: now } : { last_seen_seller: now }).eq('id', call.id).in('status', ['ringing', 'active']);
          const fresh = await tickCall(admin, { ...call, ...(isClient ? { last_seen_client: now } : { last_seen_seller: now }) });
          return json(publicState(fresh));
        }
        return json(publicState(call));
      }
      case 'end': {
        if (call.status === 'active') await finishCall(admin, call, Date.now(), 'normal');
        else if (isClient && (call.status === 'awaiting_payment' || call.status === 'ringing')) await closeWithoutCharge(admin, call, 'cancelled');
        break;
      }
      case 'token': {
        if (call.status !== 'active') return json({ error: 'not_active' }, 409);
        if (!livekitConfigured()) return json({ error: 'livekit_not_configured' }, 503);
        const { data: me } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
        const lk = await livekitToken({ room: call.livekit_room ?? `call-${call.id}`, identity: user.id, name: me?.full_name ?? 'Timeet', ttlSeconds: 70 * 60 });
        return json({ ...lk, room: call.livekit_room ?? `call-${call.id}` });
      }
      default:
        return json({ error: 'bad_request' }, 400);
    }
    const { data: after } = await admin.from('calls').select(CALL_COLUMNS).eq('id', call.id).single();
    return json(publicState(after as CallRow));
  } catch (error) {
    if (error instanceof StripeError) {
      const detail = (error.body as { error?: { code?: string; message?: string } })?.error;
      console.error('Errore Stripe', JSON.stringify(error.body));
      return json({ error: 'stripe_error', code: detail?.code ?? null, message: detail?.message ?? null }, 502);
    }
    console.error('Errore imprevisto', error);
    return json({ error: 'server_error' }, 500);
  }
});

async function start(admin: ReturnType<typeof createClient>, userId: string, email: string | undefined, serviceId: string | undefined): Promise<Response> {
  if (!serviceId) return json({ error: 'bad_request' }, 400);
  const { data: me } = await admin.from('profiles').select('adult_confirmed_at, full_name').eq('id', userId).maybeSingle();
  if (!me?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  const { data: service } = await admin.from('services').select('id, seller_id, kind, title, rate_cents_per_min, active').eq('id', serviceId).maybeSingle();
  if (!service || !service.active || service.kind !== 'per_minute' || !service.rate_cents_per_min) return json({ error: 'service_not_found' }, 404);
  if (service.seller_id === userId) return json({ error: 'own_service' }, 400);
  if (service.rate_cents_per_min < CALL_MIN_RATE_CENTS) return json({ error: 'rate_too_low' }, 409);

  const [{ data: seller }, { data: account }, { data: live }, { data: busyBooking }, { data: myLive }] = await Promise.all([
    admin.from('profiles').select('is_pro, available_until').eq('id', service.seller_id).single(),
    admin.from('stripe_accounts').select('stripe_account_id, charges_enabled').eq('seller_id', service.seller_id).maybeSingle(),
    admin.from('calls').select('id').eq('seller_id', service.seller_id).in('status', ['ringing', 'active']).limit(1),
    admin.from('bookings').select('id').eq('seller_id', service.seller_id).eq('status', 'confirmed')
      .lt('starts_at', new Date(Date.now() + 20 * 60_000).toISOString()).gt('ends_at', new Date().toISOString()).limit(1),
    admin.from('calls').select('id').eq('client_id', userId).in('status', ['awaiting_payment', 'ringing', 'active']).limit(1),
  ]);
  if (!account?.charges_enabled) return json({ error: 'seller_not_ready' }, 409);
  if (!seller?.available_until || Date.parse(seller.available_until) <= Date.now()) return json({ error: 'seller_unavailable' }, 409);
  if (live?.length || busyBooking?.length) return json({ error: 'seller_busy' }, 409);
  if (myLive?.length) return json({ error: 'call_in_progress' }, 409);

  const base = CALL_BLOCK_MIN * service.rate_cents_per_min;
  const fees = callBlockFees(base, true, !!seller.is_pro);

  const { data: call, error: callError } = await admin.from('calls').insert({
    client_id: userId, seller_id: service.seller_id, service_id: service.id, service_title: service.title,
    rate_cents_per_min: service.rate_cents_per_min, reserve_cents: fees.totalChargeCents, status: 'awaiting_payment',
  }).select('id').single();
  if (callError) return json({ error: callError.code === '23505' ? 'call_in_progress' : 'server_error' }, callError.code === '23505' ? 409 : 500);

  try {
    // cliente Stripe sull'account del venditore (serve per rinnovare il blocco senza chiedere di nuovo la carta)
    const { data: existing } = await admin.from('stripe_customers').select('stripe_customer_id').eq('user_id', userId).eq('stripe_account_id', account.stripe_account_id).maybeSingle();
    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>('POST', '/v1/customers', { email, name: me.full_name ?? undefined, metadata: { timeet_user_id: userId } },
        { idempotencyKey: `timeet-customer-${userId}-${account.stripe_account_id}`, stripeAccount: account.stripe_account_id });
      customerId = customer.id;
      await admin.from('stripe_customers').insert({ user_id: userId, stripe_customer_id: customerId, stripe_account_id: account.stripe_account_id });
    }
    const pi = await stripeRequest<PI>('POST', '/v1/payment_intents', {
      amount: fees.totalChargeCents, currency: 'eur', customer: customerId, capture_method: 'manual', setup_future_usage: 'off_session',
      application_fee_amount: fees.applicationFeeCents, automatic_payment_methods: { enabled: true },
      description: `Chiamata: ${service.title}`, metadata: { call_id: call.id, call_block: '0', payer_id: userId, seller_id: service.seller_id },
    }, { idempotencyKey: `timeet-call-${call.id}`, stripeAccount: account.stripe_account_id });
    const { error: payError } = await admin.from('payments').insert({
      payer_id: userId, seller_id: service.seller_id, stripe_account_id: account.stripe_account_id, stripe_payment_intent_id: pi.id,
      status: 'pending', amount_cents: fees.totalChargeCents, application_fee_cents: fees.applicationFeeCents, call_id: call.id, call_block: 0,
    });
    if (payError) throw payError;
    return json({ call_id: call.id, client_secret: pi.client_secret, stripe_account: account.stripe_account_id, amount_cents: fees.totalChargeCents, ring_seconds: CALL_RING_SECONDS });
  } catch (error) {
    await admin.from('calls').update({ status: 'cancelled', ended_at: new Date().toISOString(), settled_at: new Date().toISOString() }).eq('id', call.id);
    await cancelHolds(admin as never, call.id);
    throw error;
  }
}
