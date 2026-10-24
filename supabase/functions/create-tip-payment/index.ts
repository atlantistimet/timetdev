// Mancia per il venditore di una sessione conclusa (addebito diretto sull'account del venditore, nessuna commissione Timeet).
// Corpo: { booking_id, amount_cents } con importo da 1 € a 200 €. Solo il cliente della prenotazione, solo se la sessione è conclusa.
// Risposta: { client_secret, stripe_account, amount_cents }. Il pagamento si registra in `payments` con tip_booking_id.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

type PI = { id: string; client_secret: string };
const MIN_TIP_CENTS = 100;
const MAX_TIP_CENTS = 20000;

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

  const body = (await req.json().catch(() => ({}))) as { booking_id?: string; amount_cents?: number };
  const amount = body.amount_cents;
  if (!body.booking_id || !Number.isInteger(amount) || amount! < MIN_TIP_CENTS || amount! > MAX_TIP_CENTS) return json({ error: 'bad_amount' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: booking } = await admin.from('bookings').select('id, client_id, seller_id, status, service_title').eq('id', body.booking_id).maybeSingle();
  if (!booking || booking.client_id !== user.id) return json({ error: 'not_found' }, 404);
  if (booking.status !== 'completed') return json({ error: 'not_completed' }, 409);

  const { data: account } = await admin.from('stripe_accounts').select('stripe_account_id, charges_enabled').eq('seller_id', booking.seller_id).maybeSingle();
  if (!account?.charges_enabled) return json({ error: 'seller_not_ready' }, 409);

  try {
    const pi = await stripeRequest<PI>('POST', '/v1/payment_intents', {
      amount: amount!,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      description: `Mancia: ${booking.service_title}`,
      metadata: { tip_booking_id: booking.id, payer_id: user.id, seller_id: booking.seller_id },
    }, { idempotencyKey: `timeet-tip-${booking.id}-${crypto.randomUUID()}`, stripeAccount: account.stripe_account_id });

    const { error: payError } = await admin.from('payments').insert({
      payer_id: user.id, seller_id: booking.seller_id, stripe_account_id: account.stripe_account_id,
      stripe_payment_intent_id: pi.id, status: 'pending', amount_cents: amount!, application_fee_cents: 0, tip_booking_id: booking.id,
    });
    if (payError) throw payError;
    return json({ client_secret: pi.client_secret, stripe_account: account.stripe_account_id, amount_cents: amount });
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
