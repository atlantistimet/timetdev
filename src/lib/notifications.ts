import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export type Notif = {
  id: string;
  kind: string;
  ref_table: string | null;
  ref_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(userId: string): Promise<{ items: Notif[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, ref_table, ref_id, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) return { items: [], errorKey: 'errors.generic' };
  return { items: (data ?? []) as Notif[], errorKey: null };
}

export async function getNotification(id: string): Promise<Notif | null> {
  const { data } = await supabase.from('notifications').select('id, kind, ref_table, ref_id, payload, read_at, created_at').eq('id', id).maybeSingle();
  return (data as Notif | null) ?? null;
}

/** La si segna letta e si apre la schermata giusta. Ritorna false se il tipo non ha una destinazione (la lista va ricaricata). */
export async function openNotification(n: Notif): Promise<boolean> {
  await markRead(n.id);
  const p = n.payload as Record<string, string | undefined>;
  switch (n.kind) {
    case 'booking_new':
    case 'booking_cancelled':
    case 'booking_no_show':
    case 'tip':
    case 'review':
      if (n.ref_id) router.push(n.ref_table === 'calls' ? { pathname: '/call/[id]', params: { id: n.ref_id } } : { pathname: '/session/[id]', params: { id: n.ref_id } });
      return true;
    case 'package_new':
      router.push('/bookings');
      return true;
    case 'message':
      if (p.sender_id) router.push({ pathname: '/chat/[userId]', params: { userId: p.sender_id } });
      return true;
    case 'comment':
    case 'tag_request':
    case 'tag_accepted':
      if (n.ref_id) router.push({ pathname: '/p/[id]', params: { id: n.ref_id } });
      return true;
    case 'review_shared':
      return true;
    case 'review_reply':
    case 'follow':
      if (p.handle) router.push({ pathname: '/u/[handle]', params: { handle: p.handle } });
      return true;
    case 'availability_expiring':
      router.push('/availability');
      return true;
    default:
      return false;
  }
}

export async function countUnread(userId: string): Promise<number> {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
}

export async function markAllRead(userId: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
}

/** Numero di notifiche non lette, riletto ogni 20 secondi (e subito all'apertura). */
export function useUnreadCount(userId: string | null, reloadKey = 0): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const load = () => void countUnread(userId).then((n) => alive && setCount(n));
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [userId, reloadKey]);
  return userId ? count : 0;
}

/** Chi ha scritto una recensione sceglie se resta anonimo o si mostra con nome e foto quando viene ricondivisa. */
export async function answerReviewPublicity(reviewId: string, makePublic: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('answer_review_publicity', { p_review: reviewId, p_public: makePublic });
  return !error;
}
