import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type ReportEntity = 'profile' | 'post' | 'comment' | 'review' | 'message';
export const REPORT_REASONS = ['offensive', 'spam', 'adult', 'fake', 'illegal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Segnalazione anonima (DSA). Con `blockUserId` blocca anche la persona. */
export async function sendReport(input: { me: string; entityType: ReportEntity; entityId: string; reason: ReportReason; details: string; blockUserId?: string | null }): Promise<string | null> {
  const { error } = await supabase.from('reports').insert({ reporter_id: input.me, entity_type: input.entityType, entity_id: input.entityId, reason: input.reason, details: input.details.trim() || null });
  if (error) return 'errors.generic';
  if (input.blockUserId) await supabase.rpc('block_user', { target: input.blockUserId });
  return null;
}

export async function blockUser(target: string): Promise<string | null> {
  const { error } = await supabase.rpc('block_user', { target });
  return error ? 'errors.generic' : null;
}

export async function unblockUser(target: string): Promise<string | null> {
  const { error } = await supabase.rpc('unblock_user', { target });
  return error ? 'errors.generic' : null;
}

export type BlockedPerson = { id: string; full_name: string; handle: string | null; avatar_path: string | null };

export async function listBlocked(me: string): Promise<BlockedPerson[]> {
  const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', me).order('created_at', { ascending: false });
  const ids = ((data ?? []) as { blocked_id: string }[]).map((r) => r.blocked_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, handle, avatar_path').in('id', ids);
  return (profiles ?? []) as BlockedPerson[];
}

/** Id delle persone da nascondere (bloccate da me o che hanno bloccato me). */
export async function loadBlockedIds(): Promise<Set<string>> {
  const { data } = await supabase.rpc('blocked_ids');
  return new Set(((data ?? []) as string[]).map(String));
}

export type TicketKind = 'payment' | 'session' | 'person' | 'bug' | 'other';
export type Ticket = { id: string; kind: TicketKind; reason: string | null; body: string | null; status: 'open' | 'answered' | 'closed'; admin_reply: string | null; created_at: string; ref_type: string | null; ref_id: string | null };

export async function createTicket(input: { me: string; kind: TicketKind; reason?: string | null; body: string; refType?: 'booking' | 'call' | 'profile' | 'post' | null; refId?: string | null }): Promise<string | null> {
  const { error } = await supabase.from('support_tickets').insert({ user_id: input.me, kind: input.kind, reason: input.reason ?? null, body: input.body.trim() || null, ref_type: input.refType ?? null, ref_id: input.refId ?? null });
  return error ? 'errors.generic' : null;
}

export async function listTickets(me: string): Promise<Ticket[]> {
  const { data } = await supabase.from('support_tickets').select('id, kind, reason, body, status, admin_reply, created_at, ref_type, ref_id').eq('user_id', me).order('created_at', { ascending: false }).limit(30);
  return (data ?? []) as Ticket[];
}

/** Eliminazione account: errorKey tra 'safety.delete.errBookings', 'safety.delete.errCalls' o generico. */
export async function deleteAccount(): Promise<string | null> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'ELIMINA' } });
  if (!error) return null;
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'has_bookings') return 'safety.delete.errBookings';
    if (body?.error === 'has_calls') return 'safety.delete.errCalls';
  }
  return 'errors.generic';
}
