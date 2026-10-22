// Webhook Stripe. Per ora tiene aggiornato lo stato dei venditori (stripe_accounts).
//  - Eventi "thin" degli Accounts v2 (v2.core.account...): il corpo contiene solo l'id dell'account;
//    lo stato aggiornato si rilegge da Stripe. Destinazione Stripe: "Il tuo account", stile Thin.
//  - Evento classico account.updated (stile Snapshot), se mai arrivasse.
//  - Pagamenti (destinazione "Account connessi", stile Snapshot): payment_intent.succeeded / payment_failed /
//    canceled aggiornano `payments`; se il pagamento viene annullato, lo slot si libera.
// Due segreti di firma, uno per destinazione: STRIPE_WEBHOOK_SECRET e STRIPE_CONNECT_WEBHOOK_SECRET.
// La firma (Stripe-Signature) è obbligatoria: senza firma valida non si scrive nulla.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncAccountStatus } from '../_shared/account-sync.ts';
import { StripeError, verifyStripeSignature } from '../_shared/stripe.ts';

type StripeEvent = {
  id: string;
  type: string;
  related_object?: { id?: string; type?: string }; // eventi thin
  data?: { object?: { id?: string; amount_received?: number; metadata?: Record<string, string> } }; // eventi snapshot
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secrets = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')].filter((x): x is string => !!x);
  if (!secrets.length) return new Response('webhook secret missing', { status: 500 });

  const payload = await req.text();
  const signature = req.headers.get('Stripe-Signature');
  let valid = false;
  for (const secret of secrets) {
    if (await verifyStripeSignature(payload, signature, secret)) { valid = true; break; }
  }
  if (!valid) return new Response('invalid signature', { status: 400 });

  const event = JSON.parse(payload) as StripeEvent;
  const isAccountEvent = event.type.startsWith('v2.core.account') || event.type === 'account.updated';
  const accountId = event.related_object?.id ?? event.data?.object?.id;

  if (isAccountEvent && accountId?.startsWith('acct_')) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try {
      await syncAccountStatus(admin, accountId);
    } catch (error) {
      console.error('Aggiornamento account fallito', accountId, error instanceof StripeError ? JSON.stringify(error.body) : error);
      return new Response('sync error', { status: 500 }); // Stripe riproverà
    }
  }

  const paymentStatus: Record<string, 'captured' | 'failed' | 'canceled'> = {
    'payment_intent.succeeded': 'captured',
    'payment_intent.payment_failed': 'failed',
    'payment_intent.canceled': 'canceled',
  };
  const status = paymentStatus[event.type];
  const intent = event.data?.object;
  if (status && intent?.id?.startsWith('pi_')) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    // Non si retrocede un pagamento già incassato (eventi fuori ordine: un "failed" vecchio non annulla un "succeeded").
    const update = admin.from('payments')
      .update({ status, ...(status === 'captured' ? { captured_cents: intent.amount_received ?? 0 } : {}) })
      .eq('stripe_payment_intent_id', intent.id);
    const { data: payment, error } = await (status === 'captured' ? update : update.neq('status', 'captured')).select('booking_id, package_id').maybeSingle();
    if (error) {
      console.error('Aggiornamento pagamento fallito', intent.id, error);
      return new Response('db error', { status: 500 });
    }
    if (payment?.booking_id && status === 'canceled') { // un rifiuto carta (failed) non libera lo slot: il cliente può riprovare
      await admin.from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', payment.booking_id).eq('status', 'confirmed');
    }
    if (payment?.package_id && status === 'canceled') { // pacchetto: si liberano tutte le sessioni
      await admin.from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('package_id', payment.package_id).eq('status', 'confirmed');
    }
  }

  return new Response('ok', { status: 200 });
});
