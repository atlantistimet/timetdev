// Webhook Stripe (endpoint Connect: eventi degli account collegati).
// Per ora aggiorna lo stato dei venditori (account.updated). Si estenderà ai pagamenti.
// La firma (Stripe-Signature) è obbligatoria: senza firma valida non si scrive nulla.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyStripeSignature } from '../_shared/stripe.ts';

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  data: { object: Record<string, unknown> };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('webhook secret missing', { status: 500 });

  const payload = await req.text();
  const valid = await verifyStripeSignature(payload, req.headers.get('Stripe-Signature'), secret);
  if (!valid) return new Response('invalid signature', { status: 400 });

  const event = JSON.parse(payload) as StripeEvent;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (event.type === 'account.updated') {
    const account = event.data.object as {
      id: string;
      details_submitted?: boolean;
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      requirements?: { currently_due?: string[]; past_due?: string[] };
    };
    const due = [...new Set([...(account.requirements?.currently_due ?? []), ...(account.requirements?.past_due ?? [])])];
    const { error } = await admin
      .from('stripe_accounts')
      .update({
        details_submitted: account.details_submitted ?? false,
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
        requirements_due: due,
      })
      .eq('stripe_account_id', account.id);
    if (error) {
      console.error('Aggiornamento account fallito', error);
      return new Response('db error', { status: 500 }); // Stripe riproverà
    }
  }

  return new Response('ok', { status: 200 });
});
