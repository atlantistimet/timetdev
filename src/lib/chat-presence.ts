import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Un solo canale Realtime per conversazione:
 *  - postgres_changes: nuovi messaggi e conferme di lettura → `onChange`
 *  - presence: chi è in chat adesso → `otherOnline`
 *  - broadcast "typing": l'altra persona sta scrivendo → `otherTyping`
 */
export function useChatPresence(convId: string | null, me: string, other: string, onChange: () => void) {
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!convId || !me) return;
    const channel = supabase.channel(`chat-${convId}`, { config: { presence: { key: me }, broadcast: { self: false } } });
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, () => {
        setOtherTyping(false);
        onChangeRef.current();
      })
      .on('presence', { event: 'sync' }, () => setOtherOnline(Object.keys(channel.presenceState()).includes(other)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user !== other) return;
        setOtherTyping(true);
        if (clearTimer.current) clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => setOtherTyping(false), 3500);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() });
      });
    channelRef.current = channel;
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [convId, me, other]);

  /** Da chiamare a ogni modifica del testo: invia al massimo un segnale ogni 2 secondi. */
  const notifyTyping = () => {
    const now = Date.now();
    if (now - lastSent.current < 2000) return;
    lastSent.current = now;
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } });
  };

  return { otherOnline, otherTyping, notifyTyping };
}
