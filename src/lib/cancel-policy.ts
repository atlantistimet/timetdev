import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type Tier = { hours_before: number; refund_pct: number };
export type CancelPolicy = { id: string; name: string; tiers: Tier[]; is_default: boolean };

// Stessa policy standard del server (supabase/functions/_shared/cancel.ts).
export const STANDARD_TIERS: Tier[] = [
  { hours_before: 48, refund_pct: 100 },
  { hours_before: 2, refund_pct: 50 },
  { hours_before: 0, refund_pct: 0 },
];

export const byHoursDesc = (tiers: Tier[]): Tier[] => [...tiers].sort((a, b) => b.hours_before - a.hours_before);

/** Stesse regole del database (valid_cancel_tiers). Restituisce la chiave di traduzione dell'errore o null. */
export function validateTiers(tiers: Tier[]): string | null {
  if (tiers.length < 1 || tiers.length > 8) return 'policy.errors.count';
  for (const tier of tiers) {
    if (!Number.isInteger(tier.hours_before) || tier.hours_before < 0 || tier.hours_before > 720) return 'policy.errors.hours';
    if (!Number.isInteger(tier.refund_pct) || tier.refund_pct < 0 || tier.refund_pct > 100) return 'policy.errors.percent';
  }
  const sorted = byHoursDesc(tiers);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].hours_before === sorted[i - 1].hours_before) return 'policy.errors.duplicate';
    if (sorted[i].refund_pct > sorted[i - 1].refund_pct) return 'policy.errors.increasing';
  }
  if (sorted[sorted.length - 1].hours_before !== 0) return 'policy.errors.needZero';
  return null;
}

export async function listPolicies(sellerId: string): Promise<{ policies: CancelPolicy[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('cancel_policies')
    .select('id, name, tiers, is_default')
    .eq('seller_id', sellerId)
    .order('created_at');
  if (error) return { policies: [], errorKey: 'errors.generic' };
  return { policies: (data ?? []) as CancelPolicy[], errorKey: null };
}

export async function loadPolicy(id: string): Promise<CancelPolicy | null> {
  const { data } = await supabase.from('cancel_policies').select('id, name, tiers, is_default').eq('id', id).maybeSingle();
  return (data as CancelPolicy | null) ?? null;
}

/** Fasce che valgono per le prenotazioni di un venditore: la sua policy predefinita, altrimenti la standard. */
export async function loadDefaultTiers(sellerId: string): Promise<Tier[]> {
  const { data } = await supabase.from('cancel_policies').select('tiers').eq('seller_id', sellerId).eq('is_default', true).maybeSingle();
  return (data?.tiers as Tier[] | undefined) ?? STANDARD_TIERS;
}

/** Fasce di un servizio: la sua policy, altrimenti la predefinita del venditore, altrimenti la standard. */
export async function loadServiceTiers(sellerId: string, policyId: string | null): Promise<Tier[]> {
  if (policyId) {
    const policy = await loadPolicy(policyId);
    if (policy) return policy.tiers;
  }
  return loadDefaultTiers(sellerId);
}

export async function savePolicy(input: {
  id: string | null;
  sellerId: string;
  name: string;
  tiers: Tier[];
  isDefault: boolean;
}): Promise<string | null> {
  if (input.isDefault) {
    // una sola predefinita per venditore
    const { error } = await supabase.from('cancel_policies').update({ is_default: false }).eq('seller_id', input.sellerId).eq('is_default', true);
    if (error) return 'errors.generic';
  }
  const row = { name: input.name.trim(), tiers: byHoursDesc(input.tiers), is_default: input.isDefault };
  const { error } = input.id
    ? await supabase.from('cancel_policies').update(row).eq('id', input.id)
    : await supabase.from('cancel_policies').insert({ ...row, seller_id: input.sellerId });
  return error ? 'errors.generic' : null;
}

export async function deletePolicy(id: string): Promise<string | null> {
  const { error } = await supabase.from('cancel_policies').delete().eq('id', id);
  return error ? 'errors.generic' : null;
}

export type CancelPreview = { refund_pct: number; refund_cents: number; paid: boolean };

async function callCancel<T>(bookingId: string, preview: boolean): Promise<{ data: T | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<T>('cancel-booking', { body: { booking_id: bookingId, preview } });
  if (!error && data) return { data, errorKey: null };
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'already_started' || body?.error === 'not_cancellable' || body?.error === 'payment_in_progress') {
      return { data: null, errorKey: `bookings.errors.${body.error}` };
    }
  }
  return { data: null, errorKey: 'errors.generic' };
}

export const previewCancel = (bookingId: string) => callCancel<CancelPreview>(bookingId, true);
export const cancelBooking = (bookingId: string) => callCancel<CancelPreview>(bookingId, false);
