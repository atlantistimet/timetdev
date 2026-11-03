import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Un canale Realtime per conversazione e per schermata (`scope`: la chat e la chat dentro la chiamata non devono condividerlo):
 *  - postgres_changes: nuovi messaggi e conferme di lettura → `onChange`
 *  - presence: chi è in chat adesso → `otherOnline`
 *  - broadcast "typing": l'altra persona sta scrivendo → `otherTyping`
 */
export function useChatPresence(convId: string | null, me: string, other: string, onChange: () => void, scope = 'chat') {
  const [otherOnline, setOtherOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);
  const joined = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!convId || !me) return;
    // lo stesso nome canale restituisce il canale già esistente (anche se si sta ancora chiudendo): lo si toglie prima
    const topic = `${scope}-${convId}`;
    for (const old of supabase.getChannels()) if (old.topic === `realtime:${topic}`) void supabase.removeChannel(old);
    const channel = supabase.channel(topic, { config: { presence: { key: me }, broadcast: { self: false } } });
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, () => {
        setOtherTyping(false);
        onChangeRef.current();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${convId}` }, () => onChangeRef.current())
      .on('presence', { event: 'sync' }, () => setOtherOnline(Object.keys(channel.presenceState()).includes(other)))
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user !== other) return;
        setOtherTyping(true);
        if (clearTimer.current) clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => setOtherTyping(false), 3500);
      })
      .subscribe((status) => {
        joined.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') void channel.track({ at: Date.now() });
      });
    channelRef.current = channel;
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      channelRef.current = null;
      joined.current = false;
      void supabase.removeChannel(channel);
    };
  }, [convId, me, other, scope]);

  /** Da chiamare a ogni modifica del testo: invia al massimo un segnale ogni 2 secondi. */
  const notifyTyping = () => {
    const now = Date.now();
    if (!joined.current || now - lastSent.current < 2000) return; // se il canale non è ancora collegato, niente: così non scatta l'invio via REST
    lastSent.current = now;
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } });
  };

  return { otherOnline, otherTyping, notifyTyping };
}
