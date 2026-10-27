import { useEffect, useState } from 'react';
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
