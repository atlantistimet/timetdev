// Registrazione del venditore su Stripe.
// Chiamata dall'app con la sessione dell'utente. Crea (una sola volta) l'account Stripe del venditore
// e restituisce il link alla verifica ospitata da Stripe. I link scadono dopo pochi minuti e valgono
// una sola visita: ogni chiamata ne genera uno nuovo.
//
// Configurazione dell'account (decisa il 12 ottobre 2026, addebiti diretti):
//  - dashboard Express; commissioni Stripe a carico del venditore; saldi negativi a carico di Stripe;
//  - verifica d'identità raccolta da Stripe; paese Italia; capability card_payments.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

type StripeAccount = { id: string };
type StripeAccountLink = { url: string; expires_at: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  // Chi è l'utente: lo dice il token, mai il corpo della richiesta.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Vendere richiede la maggiore età dichiarata (controllo lato server).
  const { data: profile } = await admin
    .from('profiles')
    .select('adult_confirmed_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  try {
    let accountId: string | null = null;
    const { data: existing } = await admin
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('seller_id', user.id)
      .maybeSingle();
    accountId = existing?.stripe_account_id ?? null;

    if (!accountId) {
      const account = await stripeRequest<StripeAccount>(
        'POST',
        '/v1/accounts',
        {
          country: 'IT',
          email: user.email,
          controller: {
            fees: { payer: 'account' }, // Stripe trattiene le sue commissioni al venditore
            losses: { payments: 'stripe' }, // i saldi negativi sono a carico di Stripe
            stripe_dashboard: { type: 'express' },
          },
          capabilities: { card_payments: { requested: true } },
          metadata: { timeet_user_id: user.id },
        },
        { idempotencyKey: `timeet-account-${user.id}` },
      );
      accountId = account.id;
      const { error: insertError } = await admin.from('stripe_accounts').upsert(
        {
          seller_id: user.id,
          stripe_account_id: accountId,
          dashboard: 'express',
          fees_collector: 'stripe',
          losses_collector: 'stripe',
        },
        { onConflict: 'seller_id' },
      );
      if (insertError) throw insertError;
    }

    const returnUrl = Deno.env.get('ONBOARDING_RETURN_URL') ?? 'http://localhost:8081/onboarding-return';
    const refreshUrl = Deno.env.get('ONBOARDING_REFRESH_URL') ?? 'http://localhost:8081/onboarding-refresh';
    const link = await stripeRequest<StripeAccountLink>('POST', '/v1/account_links', {
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
      collection_options: { fields: 'eventually_due' },
    });

    return json({ url: link.url, expires_at: link.expires_at });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error('Errore Stripe', JSON.stringify(error.body));
      return json({ error: 'stripe_error' }, 502);
    }
    console.error('Errore imprevisto', error);
    return json({ error: 'server_error' }, 500);
  }
});
