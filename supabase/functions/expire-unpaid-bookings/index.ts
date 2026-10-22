// Libera gli slot delle prenotazioni non pagate entro 15 minuti.
// Chiamata ogni 5 minuti da pg_cron (vedi README), non dall'app: protetta da un segreto condiviso (CRON_SECRET).
// Per ogni pagamento ancora "pending" e più vecchio di 15 minuti:
//  1. annulla il PaymentIntent su Stripe (così non si può più pagare uno slot già liberato);
//  2. segna il pagamento "canceled" e la prenotazione "cancelled".
// Se Stripe dice che il pagamento è appena andato a buon fine (stato non più annullabile), non si tocca nulla:
// ci pensa il webhook a segnarlo "captured".
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

const EXPIRE_AFTER_MINUTES = 15;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cutoff = new Date(Date.now() - EXPIRE_AFTER_MINUTES * 60_000).toISOString();

  const { data: stale, error } = await admin
    .from('payments')
    .select('id, booking_id, package_id, stripe_payment_intent_id, stripe_account_id')
    .eq('status', 'pending')
    .or('booking_id.not.is.null,package_id.not.is.null')
    .lt('created_at', cutoff)
    .limit(50);
  if (error) return json({ error: 'server_error' }, 500);

  let expired = 0;
  let skipped = 0;
  for (const payment of stale ?? []) {
    try {
      await stripeRequest('POST', `/v1/payment_intents/${payment.stripe_payment_intent_id}/cancel`, {}, {
        stripeAccount: payment.stripe_account_id,
        idempotencyKey: `timeet-expire-${payment.id}`,
      });
    } catch (e) {
      const code = e instanceof StripeError ? (e.body as { error?: { code?: string } })?.error?.code : null;
      if (code === 'payment_intent_unexpected_state') {
        skipped++; // già pagato o già annullato: lo stato lo aggiorna il webhook
        continue;
      }
      console.error('Annullamento PaymentIntent fallito', payment.stripe_payment_intent_id, e instanceof StripeError ? JSON.stringify(e.body) : e);
      skipped++;
      continue;
    }
    // Le condizioni sullo stato evitano di sovrascrivere un pagamento arrivato nel frattempo.
    const { data: updated } = await admin.from('payments').update({ status: 'canceled' }).eq('id', payment.id).eq('status', 'pending').select('id');
    if (updated?.length) {
      const cancelled = { status: 'cancelled', cancelled_at: new Date().toISOString() };
      if (payment.package_id) await admin.from('bookings').update(cancelled).eq('package_id', payment.package_id).eq('status', 'confirmed');
      else await admin.from('bookings').update(cancelled).eq('id', payment.booking_id).eq('status', 'confirmed');
      expired++;
    }
  }
  return json({ expired, skipped });
});
