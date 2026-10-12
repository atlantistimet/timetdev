// Webhook Stripe. Per ora tiene aggiornato lo stato dei venditori (stripe_accounts).
//  - Eventi "thin" degli Accounts v2 (v2.core.account...): il corpo contiene solo l'id dell'account;
//    lo stato aggiornato si rilegge da Stripe. Destinazione Stripe: "Il tuo account", stile Thin.
//  - Evento classico account.updated (stile Snapshot), se mai arrivasse.
// La firma (Stripe-Signature) è obbligatoria: senza firma valida non si scrive nulla.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncAccountStatus } from '../_shared/account-sync.ts';
import { StripeError, verifyStripeSignature } from '../_shared/stripe.ts';

type StripeEvent = {
  id: string;
  type: string;
  related_object?: { id?: string; type?: string }; // eventi thin
  data?: { object?: { id?: string } }; // eventi snapshot
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('webhook secret missing', { status: 500 });

  const payload = await req.text();
  const valid = await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), secret);
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

  return new Response('ok', { status: 200 });
});
