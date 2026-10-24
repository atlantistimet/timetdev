// Ciclo di vita e denaro delle chiamate al minuto. Usato da `call-action` (azioni dell'utente) e `sweep-calls` (ogni minuto).
// Regole (decise con Nicolò):
//  - blocco iniziale = 15 minuti × tariffa, autorizzato sulla carta (cattura manuale); altri blocchi da 15 minuti fino a 60 totali
//  - si pagano i minuti collegati, arrotondati per eccesso, minimo 5 e massimo 60; il conteggio parte quando il venditore risponde
//  - nessun addebito se il venditore non risponde entro 60 s o rifiuta; se la linea cade si paga fino all'ultimo battito di presenza
//  - commissioni: 5% + 0,50 € a testa (fisso una volta sola per chiamata)
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { stripeRequest, StripeError } from './stripe.ts';
import {
  callBlockFees, CALL_AWAITING_PAYMENT_MINUTES, CALL_BLOCK_MIN, CALL_MAX_MIN, CALL_MIN_BILLED_MIN, CALL_STALE_SECONDS,
} from './fees.ts';

export type CallRow = {
  id: string; client_id: string; seller_id: string; service_id: string | null; service_title: string | null;
  rate_cents_per_min: number; status: 'awaiting_payment' | 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled';
  started_at: string | null; ended_at: string | null; created_at: string; ring_expires_at: string | null;
  last_seen_client: string | null; last_seen_seller: string | null; blocks_held: number; extend_failed: boolean;
  extending_since: string | null; settled_at: string | null; livekit_room: string | null;
};
export const CALL_COLUMNS =
  'id, client_id, seller_id, service_id, service_title, rate_cents_per_min, status, started_at, ended_at, created_at, ring_expires_at, last_seen_client, last_seen_seller, blocks_held, extend_failed, extending_since, settled_at, livekit_room';

type Admin = SupabaseClient;
type PayRow = { id: string; stripe_payment_intent_id: string; stripe_account_id: string; status: string; call_block: number | null; payer_id: string; seller_id: string };

const ms = (v: string | null) => (v ? Date.parse(v) : NaN);

async function stripeSafe(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return true; } catch (error) {
    // PaymentIntent già annullato o già incassato: va bene così
    if (error instanceof StripeError && (error.body as { error?: { code?: string } })?.error?.code === 'payment_intent_unexpected_state') return true;
    console.error('Errore Stripe (chiamata)', error instanceof StripeError ? JSON.stringify(error.body) : error);
    return false;
  }
}

/** Annulla tutti i blocchi non incassati. Ritorna true se non è rimasto nulla da fare. */
export async function cancelHolds(admin: Admin, callId: string): Promise<boolean> {
  const { data } = await admin.from('payments').select('id, stripe_payment_intent_id, stripe_account_id, status').eq('call_id', callId).in('status', ['pending', 'authorized']);
  let ok = true;
  for (const p of (data ?? []) as PayRow[]) {
    const done = await stripeSafe(() => stripeRequest('POST', `/v1/payment_intents/${p.stripe_payment_intent_id}/cancel`, {}, { stripeAccount: p.stripe_account_id }));
    if (done) await admin.from('payments').update({ status: 'canceled' }).eq('id', p.id);
    else ok = false;
  }
  return ok;
}

/** Chiude senza addebito (non risposta, rifiuto, annullo) e libera la carta. */
export async function closeWithoutCharge(admin: Admin, call: CallRow, status: 'missed' | 'declined' | 'cancelled'): Promise<void> {
  const { data: won } = await admin.from('calls')
    .update({ status, ended_at: new Date().toISOString(), end_reason: status === 'missed' ? 'no_show' : null })
    .eq('id', call.id).in('status', ['awaiting_payment', 'ringing']).select('id').maybeSingle();
  if (!won) return;
  if (await cancelHolds(admin, call.id)) await admin.from('calls').update({ settled_at: new Date().toISOString() }).eq('id', call.id);
}

/** Conclude una chiamata attiva e incassa i minuti usati. */
export async function finishCall(admin: Admin, call: CallRow, endedAtMs: number, reason: 'normal' | 'balance' | 'error'): Promise<void> {
  const started = ms(call.started_at);
  const endedAt = new Date(Math.min(Math.max(endedAtMs, started), Date.now())).toISOString();
  const { data: won } = await admin.from('calls').update({ status: 'ended', ended_at: endedAt, end_reason: reason }).eq('id', call.id).eq('status', 'active').select(CALL_COLUMNS).maybeSingle();
  if (won) await settleCall(admin, won as CallRow);
}

/** Incassa i minuti effettivi sui blocchi autorizzati e annulla quelli non usati. Si può ripetere senza doppi addebiti. */
export async function settleCall(admin: Admin, call: CallRow): Promise<void> {
  if (!call.started_at || !call.ended_at) { // mai partita
    if (await cancelHolds(admin, call.id)) await admin.from('calls').update({ settled_at: new Date().toISOString() }).eq('id', call.id);
    return;
  }
  const seconds = Math.max(0, (ms(call.ended_at) - ms(call.started_at)) / 1000);
  const heldMin = Math.max(call.blocks_held, 1) * CALL_BLOCK_MIN;
  const billed = Math.min(Math.max(Math.ceil(seconds / 60), CALL_MIN_BILLED_MIN), heldMin, CALL_MAX_MIN);

  const [{ data: seller }, { data: pays }] = await Promise.all([
    admin.from('profiles').select('is_pro').eq('id', call.seller_id).single(),
    admin.from('payments').select('id, stripe_payment_intent_id, stripe_account_id, status, call_block, payer_id, seller_id').eq('call_id', call.id).order('call_block'),
  ]);
  let base = 0, clientFee = 0, sellerFee = 0, ok = true;
  for (const p of (pays ?? []) as PayRow[]) {
    const block = p.call_block ?? 0;
    const used = Math.min(Math.max(billed - block * CALL_BLOCK_MIN, 0), CALL_BLOCK_MIN);
    if (used === 0) {
      if (p.status !== 'canceled') {
        const done = await stripeSafe(() => stripeRequest('POST', `/v1/payment_intents/${p.stripe_payment_intent_id}/cancel`, {}, { stripeAccount: p.stripe_account_id }));
        if (done) await admin.from('payments').update({ status: 'canceled' }).eq('id', p.id); else ok = false;
      }
      continue;
    }
    const blockBase = used * call.rate_cents_per_min;
    const fees = callBlockFees(blockBase, block === 0, !!seller?.is_pro);
    base += blockBase; clientFee += fees.clientFeeCents; sellerFee += fees.sellerFeeCents;
    if (p.status === 'captured') continue;
    const done = await stripeSafe(() => stripeRequest('POST', `/v1/payment_intents/${p.stripe_payment_intent_id}/capture`, {
      amount_to_capture: fees.totalChargeCents, application_fee_amount: fees.applicationFeeCents,
    }, { idempotencyKey: `timeet-call-capture-${p.id}`, stripeAccount: p.stripe_account_id }));
    if (done) await admin.from('payments').update({ status: 'captured', captured_cents: fees.totalChargeCents, application_fee_cents: fees.applicationFeeCents }).eq('id', p.id);
    else ok = false;
  }
  await admin.from('calls').update({
    billed_minutes: billed, amount_cents: base, client_fee_cents: clientFee, seller_fee_cents: sellerFee,
    ...(ok ? { settled_at: new Date().toISOString() } : {}),
  }).eq('id', call.id);
}

/** Autorizza un blocco in più sulla carta già usata (senza che il cliente debba fare nulla). */
async function extendCall(admin: Admin, call: CallRow): Promise<void> {
  const staleBefore = new Date(Date.now() - 60_000).toISOString();
  const { data: claim } = await admin.from('calls').update({ extending_since: new Date().toISOString() })
    .eq('id', call.id).eq('status', 'active').eq('blocks_held', call.blocks_held).or(`extending_since.is.null,extending_since.lt.${staleBefore}`).select('id').maybeSingle();
  if (!claim) return;
  const fail = async () => { await admin.from('calls').update({ extend_failed: true, extending_since: null }).eq('id', call.id); };
  try {
    const { data: first } = await admin.from('payments').select('stripe_payment_intent_id, stripe_account_id').eq('call_id', call.id).eq('call_block', 0).single();
    const [{ data: seller }] = await Promise.all([admin.from('profiles').select('is_pro').eq('id', call.seller_id).single()]);
    if (!first) return fail();
    const prev = await stripeRequest<{ payment_method: string | null; customer: string | null }>('GET', `/v1/payment_intents/${first.stripe_payment_intent_id}`, undefined, { stripeAccount: first.stripe_account_id });
    if (!prev.payment_method || !prev.customer) return fail();
    const block = call.blocks_held; // indice del nuovo blocco (0 = primo)
    const fees = callBlockFees(CALL_BLOCK_MIN * call.rate_cents_per_min, false, !!seller?.is_pro);
    const pi = await stripeRequest<{ id: string; status: string }>('POST', '/v1/payment_intents', {
      amount: fees.totalChargeCents, currency: 'eur', customer: prev.customer, payment_method: prev.payment_method,
      off_session: true, confirm: true, capture_method: 'manual', application_fee_amount: fees.applicationFeeCents,
      description: call.service_title ?? 'Chiamata', metadata: { call_id: call.id, call_block: String(block), payer_id: call.client_id, seller_id: call.seller_id },
    }, { idempotencyKey: `timeet-call-ext-${call.id}-${block}`, stripeAccount: first.stripe_account_id });
    if (pi.status !== 'requires_capture') { // serve un'autenticazione del cliente: non si può fare in automatico
      await stripeSafe(() => stripeRequest('POST', `/v1/payment_intents/${pi.id}/cancel`, {}, { stripeAccount: first.stripe_account_id }));
      return fail();
    }
    await admin.from('payments').insert({
      payer_id: call.client_id, seller_id: call.seller_id, stripe_account_id: first.stripe_account_id, stripe_payment_intent_id: pi.id,
      status: 'authorized', amount_cents: fees.totalChargeCents, application_fee_cents: fees.applicationFeeCents, call_id: call.id, call_block: block,
    });
    await admin.from('calls').update({ blocks_held: call.blocks_held + 1, extending_since: null }).eq('id', call.id);
  } catch (error) {
    console.error('Prolungamento chiamata fallito', call.id, error instanceof StripeError ? JSON.stringify(error.body) : error);
    await fail();
  }
}

/** Controlla scadenze, cadute di linea e prolungamenti. Ritorna la chiamata aggiornata. */
export async function tickCall(admin: Admin, call: CallRow): Promise<CallRow> {
  const now = Date.now();
  if (call.status === 'awaiting_payment' && now - ms(call.created_at) > CALL_AWAITING_PAYMENT_MINUTES * 60_000) {
    await closeWithoutCharge(admin, call, 'cancelled');
  } else if (call.status === 'ringing') {
    const clientGone = now - Math.max(ms(call.last_seen_client) || 0, ms(call.created_at)) > CALL_STALE_SECONDS * 1000;
    if (now > ms(call.ring_expires_at)) await closeWithoutCharge(admin, call, 'missed');
    else if (clientGone) await closeWithoutCharge(admin, call, 'cancelled');
  } else if (call.status === 'active') {
    const started = ms(call.started_at);
    const cs = ms(call.last_seen_client) || started;
    const ss = ms(call.last_seen_seller) || started;
    const covered = started + call.blocks_held * CALL_BLOCK_MIN * 60_000;
    if (now - cs > CALL_STALE_SECONDS * 1000 || now - ss > CALL_STALE_SECONDS * 1000) {
      await finishCall(admin, call, Math.min(cs, ss), 'error');
    } else if (now >= covered) {
      await finishCall(admin, call, covered, call.blocks_held * CALL_BLOCK_MIN >= CALL_MAX_MIN ? 'normal' : 'balance');
    } else if (covered - now < 3 * 60_000 && call.blocks_held < CALL_MAX_MIN / CALL_BLOCK_MIN && !call.extend_failed) {
      await extendCall(admin, call);
    }
  }
  const { data } = await admin.from('calls').select(CALL_COLUMNS).eq('id', call.id).single();
  return data as CallRow;
}
