// Registrazione del venditore su Stripe.
// Chiamata dall'app con la sessione dell'utente.
//  - { action: 'onboard' } (predefinita): crea (una sola volta) l'account Stripe del venditore e restituisce
//    il link alla verifica ospitata da Stripe. I link scadono dopo pochi minuti e valgono una sola visita.
//  - { action: 'refresh' }: rilegge lo stato dell'account da Stripe e lo salva (per quando il webhook tarda).
//
// Configurazione dell'account (decisa il 12 ottobre 2026, addebiti diretti), Accounts v2:
//  dashboard Express; commissioni Stripe a carico del venditore; saldi negativi a carico di Stripe;
//  verifica d'identità raccolta da Stripe; paese Italia; capability card_payments.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { syncAccountStatus } from '../_shared/account-sync.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { PREVIEW_API_VERSION, stripeV2, StripeError } from '../_shared/stripe.ts';

// Express + saldi negativi a carico di Stripe è disponibile solo nella versione API di anteprima.
const V = { version: PREVIEW_API_VERSION };

type V2Account = { id: string };
type V2AccountLink = { url: string; expires_at: string };
type V2AccountDefaults = { defaults?: { responsibilities?: { fees_collector?: string; losses_collector?: string } } };

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

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const action = body.action ?? 'onboard';
  if (action !== 'onboard' && action !== 'refresh') return json({ error: 'bad_action' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Vendere richiede la maggiore età dichiarata (controllo lato server).
  const { data: profile } = await admin
    .from('profiles')
    .select('adult_confirmed_at, full_name, preferred_lang')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.adult_confirmed_at) return json({ error: 'adult_required' }, 403);

  try {
    const { data: existing } = await admin
      .from('stripe_accounts')
      .select('stripe_account_id')
      .eq('seller_id', user.id)
      .maybeSingle();
    let accountId: string | null = existing?.stripe_account_id ?? null;

    if (action === 'refresh') {
      if (!accountId) return json({ error: 'no_account' }, 404);
      const status = await syncAccountStatus(admin, accountId);
      const defaults = await stripeV2<V2AccountDefaults>('GET', `/v2/core/accounts/${accountId}?include[0]=defaults`, undefined, V);
      return json({
        ...status,
        responsibilities: defaults.defaults?.responsibilities ?? null,
      });
    }

    if (!accountId) {
      const account = await stripeV2<V2Account>(
        'POST',
        '/v2/core/accounts',
        {
          contact_email: user.email,
          display_name: profile.full_name || user.email,
          dashboard: 'express',
          identity: { country: 'it' },
          configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
          defaults: {
            currency: 'eur',
            responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
            locales: [profile.preferred_lang === 'en' ? 'en-IT' : 'it-IT'],
          },
          metadata: { timeet_user_id: user.id },
        },
        { idempotencyKey: `timeet-account-${user.id}`, ...V },
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
    const link = await stripeV2<V2AccountLink>('POST', '/v2/core/account_links', {
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: { return_url: returnUrl, refresh_url: refreshUrl },
      },
    }, V);

    return json({ url: link.url, expires_at: link.expires_at });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error('Errore Stripe', JSON.stringify(error.body));
      // Codice e messaggio di Stripe non sono segreti: utili per capire cosa manca nella configurazione.
      const detail = (error.body as { error?: { code?: string; message?: string } })?.error;
      return json({ error: 'stripe_error', code: detail?.code ?? null, message: detail?.message ?? null }, 502);
    }
    console.error('Errore imprevisto', error);
    return json({ error: 'server_error' }, 500);
  }
});
