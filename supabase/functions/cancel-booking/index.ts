// Annulla una prenotazione e rimborsa secondo la policy congelata nella prenotazione.
// Corpo: { booking_id, preview?: boolean }. Con preview:true restituisce solo l'importo del rimborso, senza fare nulla.
//  - Annulla il cliente: rimborso secondo le fasce della prenotazione (cancel_tiers).
//  - Annulla il venditore: rimborso sempre totale.
//  - Prenotazione non ancora pagata: si annulla il pagamento, nessun rimborso.
// Il rimborso è sull'account del venditore (addebito diretto) e include la quota proporzionale della commissione Timeet
// (refund_application_fee). Non si annulla una sessione già iniziata.
// Pacchetti: un solo pagamento per tutte le sessioni. Ogni sessione ha la sua quota (prezzo + extra + quota di commissione cliente);
// si rimborsa solo la quota della sessione annullata. Se il pacchetto non è ancora pagato, si annulla per intero.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { refundAmount, refundPercent, type Tier } from '../_shared/cancel.ts';
import { stripeRequest, StripeError } from '../_shared/stripe.ts';

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

  const body = (await req.json().catch(() => ({}))) as { booking_id?: string; preview?: boolean };
  if (!body.booking_id) return json({ error: 'bad_request' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: booking } = await admin
    .from('bookings')
    .select('id, client_id, seller_id, starts_at, ends_at, status, cancel_tiers, package_id, price_cents, extra_cents, client_fee_cents')
    .eq('id', body.booking_id)
    .maybeSingle();
  // Non si rivela se la prenotazione esiste a chi non ne fa parte.
  if (!booking || (booking.client_id !== user.id && booking.seller_id !== user.id)) return json({ error: 'not_found' }, 404);
  if (booking.status !== 'confirmed') return json({ error: 'not_cancellable' }, 409);
  const startsAt = new Date(booking.starts_at);
  // Una sessione già iniziata (es. "Prenota ora") si può annullare finché non è finita; la policy decide il rimborso (venditore: sempre totale).
  if (new Date(booking.ends_at).getTime() <= Date.now()) return json({ error: 'already_started' }, 409);

  const { data: payment } = await admin
    .from('payments')
    .select('id, status, amount_cents, application_fee_cents, refunded_cents, application_fee_refunded_cents, stripe_payment_intent_id, stripe_account_id')
    .eq(booking.package_id ? 'package_id' : 'booking_id', booking.package_id ?? booking.id)
    .maybeSingle();

  const byClient = booking.client_id === user.id;
  const pct = byClient ? refundPercent(booking.cancel_tiers as Tier[], startsAt) : 100;
  const paid = payment?.status === 'captured';
  // importo pagato per QUESTA sessione: per i pacchetti la sua quota del pagamento unico
  const shareCents = booking.package_id ? booking.price_cents + booking.extra_cents + booking.client_fee_cents : (payment?.amount_cents ?? 0);
  const remaining = paid ? payment!.amount_cents - payment!.refunded_cents : 0;
  const refundCents = paid ? Math.min(refundAmount(shareCents, pct), remaining) : 0;

  if (body.preview) return json({ refund_pct: paid ? pct : 0, refund_cents: refundCents, paid });

  // Si "prende" la prenotazione per prima: due richieste insieme non rimborsano due volte.
  const wholePackage = !!booking.package_id && !paid; // pacchetto non pagato: si annullano tutte le sessioni
  const claimQuery = admin
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, refund_cents: refundCents })
    .eq('status', 'confirmed');
  const { data: claimed } = await (wholePackage ? claimQuery.eq('package_id', booking.package_id!) : claimQuery.eq('id', booking.id)).select('id');
  if (!claimed?.length) return json({ error: 'not_cancellable' }, 409);

  const claimedIds = claimed.map((c) => c.id as string);
  const revert = () => admin.from('bookings').update({ status: 'confirmed', cancelled_at: null, cancelled_by: null, refund_cents: 0 }).in('id', claimedIds);

  try {
    if (payment && !paid && payment.status === 'pending') {
      // Mai pagata: si annulla il pagamento perché non possa essere completato dopo.
      try {
        await stripeRequest('POST', `/v1/payment_intents/${payment.stripe_payment_intent_id}/cancel`, {}, {
          stripeAccount: payment.stripe_account_id, idempotencyKey: `timeet-cancel-pi-${payment.id}`,
        });
        await admin.from('payments').update({ status: 'canceled' }).eq('id', payment.id).eq('status', 'pending');
      } catch (e) {
        const code = e instanceof StripeError ? (e.body as { error?: { code?: string } })?.error?.code : null;
        if (code === 'payment_intent_unexpected_state') {
          // Nel frattempo è stato pagato: non si annulla in silenzio una prenotazione pagata.
          await revert();
          return json({ error: 'payment_in_progress' }, 409);
        }
        throw e;
      }
    } else if (paid && refundCents > 0) {
      await stripeRequest('POST', '/v1/refunds', {
        payment_intent: payment!.stripe_payment_intent_id,
        amount: refundCents,
        refund_application_fee: true, // la nostra commissione torna indietro in proporzione
        metadata: { booking_id: booking.id, cancelled_by: user.id },
      }, { stripeAccount: payment!.stripe_account_id, idempotencyKey: `timeet-cancel-${booking.id}` });
      const feeRefunded = Math.round((payment!.application_fee_cents * refundCents) / payment!.amount_cents);
      const totalRefunded = payment!.refunded_cents + refundCents;
      await admin.from('payments').update({
        refunded_cents: totalRefunded,
        application_fee_refunded_cents: payment!.application_fee_refunded_cents + feeRefunded,
        status: totalRefunded >= payment!.amount_cents ? 'refunded' : 'captured',
      }).eq('id', payment!.id);
    }
  } catch (e) {
    await revert();
    if (e instanceof StripeError) {
      console.error('Rimborso fallito', JSON.stringify(e.body));
      const detail = (e.body as { error?: { code?: string; message?: string } })?.error;
      return json({ error: 'stripe_error', code: detail?.code ?? null, message: detail?.message ?? null }, 502);
    }
    console.error('Errore imprevisto', e);
    return json({ error: 'server_error' }, 500);
  }

  return json({ refund_pct: paid ? pct : 0, refund_cents: refundCents });
});
