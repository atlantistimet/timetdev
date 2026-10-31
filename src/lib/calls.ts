import { FunctionsHttpError } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/** Le chiamate funzionano dal browser e nell'app installata (build di sviluppo o di produzione), non in Expo Go: manca la libreria LiveKit nativa. */
export const callsSupported = Platform.OS === 'web' || Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Regole di prezzo (le stesse del server, qui solo per le anteprime: il server ricalcola sempre).
export const CALL_BLOCK_MIN = 15;
export const CALL_MIN_BILLED_MIN = 5;
export const CALL_MAX_MIN = 60;
export const CALL_MIN_RATE_CENTS = 50;
const CALL_FIXED_FEE_CENTS = 50;

/** Importo che il cliente paga per `minutes` minuti: tariffa × minuti + 5% + 0,50 € fisso. */
export function clientCallTotal(rateCents: number, minutes: number): number {
  const base = rateCents * minutes;
  return base + Math.round(base * 0.05) + CALL_FIXED_FEE_CENTS;
}

export type CallStatus = 'awaiting_payment' | 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled';
export type CallState = {
  call_id: string;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  covered_until: string | null;
  blocks_held: number;
  extend_failed: boolean;
  ring_expires_at: string | null;
};
export type CallRow = {
  id: string;
  client_id: string;
  seller_id: string;
  service_title: string | null;
  rate_cents_per_min: number;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  ring_expires_at: string | null;
  billed_minutes: number;
  amount_cents: number;
  client_fee_cents: number;
  seller_fee_cents: number;
  blocks_held: number;
  extend_failed: boolean;
  end_reason: 'normal' | 'balance' | 'no_show' | 'error' | null;
};
const ROW_COLUMNS = 'id, client_id, seller_id, service_title, rate_cents_per_min, status, started_at, ended_at, ring_expires_at, billed_minutes, amount_cents, client_fee_cents, seller_fee_cents, blocks_held, extend_failed, end_reason';

const KNOWN_ERRORS = [
  'adult_required', 'service_not_found', 'own_service', 'rate_too_low', 'seller_not_ready', 'seller_unavailable', 'seller_busy',
  'call_in_progress', 'not_authorized', 'not_ringing', 'not_active', 'livekit_not_configured', 'stripe_error',
];

async function invoke<T>(body: Record<string, unknown>): Promise<{ data: T | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<T>('call-action', { body });
  if (!error && data) return { data, errorKey: null };
  if (error instanceof FunctionsHttpError) {
    const parsed = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (parsed?.error && KNOWN_ERRORS.includes(parsed.error)) return { data: null, errorKey: `calls.errors.${parsed.error}` };
  }
  return { data: null, errorKey: 'errors.generic' };
}

export type StartedCall = { call_id: string; client_secret: string; stripe_account: string; amount_cents: number; ring_seconds: number };

export const startCall = (serviceId: string) => invoke<StartedCall>({ action: 'start', service_id: serviceId });
export const confirmHold = (callId: string) => invoke<CallState>({ action: 'confirm_hold', call_id: callId });
export const acceptCall = (callId: string) => invoke<CallState>({ action: 'accept', call_id: callId });
export const declineCall = (callId: string) => invoke<CallState>({ action: 'decline', call_id: callId });
export const cancelCall = (callId: string) => invoke<CallState>({ action: 'cancel', call_id: callId });
export const heartbeat = (callId: string) => invoke<CallState>({ action: 'heartbeat', call_id: callId });
export const endCall = (callId: string) => invoke<CallState>({ action: 'end', call_id: callId });
export const callToken = (callId: string) => invoke<{ url: string; token: string; room: string }>({ action: 'token', call_id: callId });

export async function loadCall(callId: string): Promise<CallRow | null> {
  const { data } = await supabase.from('calls').select(ROW_COLUMNS).eq('id', callId).maybeSingle();
  return (data as CallRow | null) ?? null;
}

/** Chiamata che sta squillando per questo venditore (con il nome di chi chiama). */
export async function loadIncomingCall(sellerId: string): Promise<(CallRow & { client_name: string | null }) | null> {
  const { data } = await supabase.from('calls').select(ROW_COLUMNS).eq('seller_id', sellerId).eq('status', 'ringing').gt('ring_expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
  const call = (data?.[0] as CallRow | undefined) ?? null;
  if (!call) return null;
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', call.client_id).maybeSingle();
  return { ...call, client_name: (profile?.full_name as string | undefined) ?? null };
}

/** Chiamata ancora aperta (in pagamento, squillo o in corso) dell'utente: per riprenderla se chiude l'app. */
export async function loadLiveCall(userId: string): Promise<CallRow | null> {
  const { data } = await supabase.from('calls').select(ROW_COLUMNS).or(`client_id.eq.${userId},seller_id.eq.${userId}`).in('status', ['ringing', 'active']).order('created_at', { ascending: false }).limit(1);
  return (data?.[0] as CallRow | undefined) ?? null;
}

export async function listMyCalls(userId: string): Promise<(CallRow & { other_name: string | null; created_at: string })[]> {
  const { data } = await supabase.from('calls').select(`${ROW_COLUMNS}, created_at`).or(`client_id.eq.${userId},seller_id.eq.${userId}`).in('status', ['ended']).order('created_at', { ascending: false }).limit(50);
  const rows = (data ?? []) as (CallRow & { created_at: string })[];
  const ids = [...new Set(rows.map((r) => (r.client_id === userId ? r.seller_id : r.client_id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of (profiles ?? []) as { id: string; full_name: string }[]) names.set(p.id, p.full_name);
  }
  return rows.map((r) => ({ ...r, other_name: names.get(r.client_id === userId ? r.seller_id : r.client_id) ?? null }));
}

export type CallService = { id: string; seller_id: string; title: string; description: string | null; rate_cents_per_min: number; active: boolean };

export async function loadCallService(id: string): Promise<CallService | null> {
  const { data } = await supabase.from('services').select('id, seller_id, title, description, rate_cents_per_min, active').eq('id', id).eq('kind', 'per_minute').maybeSingle();
  return (data as CallService | null) ?? null;
}
