import { supabase } from '@/lib/supabase';

export type MediaAttachment = { kind: 'media'; type: 'image' | 'video' | 'file' | 'audio'; path: string; name: string; size: number; mime: string; durationMs?: number };
/** Biglietti nella conversazione: un profilo condiviso o uno slot personalizzato (link di prenotazione). */
export type ProfileCard = { kind: 'profile'; id: string; name: string; handle: string | null; avatar: string | null };
export type SlotCard = { kind: 'slot'; code: string; title: string; price_cents: number; duration_min: number };
export type ChatAttachment = MediaAttachment | ProfileCard | SlotCard;
export type Message = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null; attachment: ChatAttachment | null };
export type ConversationItem = { id: string; otherId: string; otherName: string; otherHandle: string | null; lastAt: string | null; lastBody: string; unread: number; otherAvatar: string | null; availableNow: boolean };

const previewOf = (a: ChatAttachment | null): string => {
  if (!a) return '';
  if (a.kind === 'profile') return `👤 ${a.name}`;
  if (a.kind === 'slot') return `📅 ${a.title}`;
  return a.type === 'image' ? '📷' : a.type === 'video' ? '🎬' : a.type === 'audio' ? '🎤' : '📄';
};

const pair = (a: string, b: string) => (a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a });

/** Trova (o crea) la conversazione fra due persone: ce n'è una sola per coppia. */
export async function openConversation(me: string, other: string): Promise<{ id: string | null; errorKey: string | null }> {
  const p = pair(me, other);
  const found = await supabase.from('conversations').select('id').eq('user_a', p.user_a).eq('user_b', p.user_b).maybeSingle();
  if (found.data) return { id: found.data.id as string, errorKey: null };
  const created = await supabase.from('conversations').insert(p).select('id').single();
  if (created.error || !created.data) {
    const retry = await supabase.from('conversations').select('id').eq('user_a', p.user_a).eq('user_b', p.user_b).maybeSingle(); // creata nel frattempo dall'altro
    return retry.data ? { id: retry.data.id as string, errorKey: null } : { id: null, errorKey: 'errors.generic' };
  }
  return { id: created.data.id as string, errorKey: null };
}

export async function loadMessages(conversationId: string): Promise<Message[]> {
  const { data } = await supabase.from('messages').select('id, sender_id, body, created_at, read_at, attachment').eq('conversation_id', conversationId).order('created_at').limit(300);
  return ((data ?? []) as Message[]).map((m) => ({ ...m, attachment: m.attachment && ['media', 'profile', 'slot'].includes(m.attachment.kind) ? m.attachment : null }));
}

export async function sendMessage(conversationId: string, senderId: string, body: string, lang: string): Promise<string | null> {
  const text = body.trim();
  if (!text) return null;
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: text, lang });
  return error ? 'errors.generic' : null;
}

export async function markRead(conversationId: string, me: string): Promise<void> {
  await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conversationId).neq('sender_id', me).is('read_at', null);
}

type ConvRow = { id: string; user_a: string; user_b: string; last_message_at: string | null };

export async function listConversations(me: string): Promise<ConversationItem[]> {
  const { data } = await supabase.from('conversations').select('id, user_a, user_b, last_message_at').not('last_message_at', 'is', null).order('last_message_at', { ascending: false }).limit(50);
  const rows = (data ?? []) as ConvRow[];
  if (rows.length === 0) return [];
  const otherIds = rows.map((r) => (r.user_a === me ? r.user_b : r.user_a));
  const [profiles, messages] = await Promise.all([
    supabase.from('profiles').select('id, full_name, handle, avatar_path, available_until').in('id', otherIds),
    supabase.from('messages').select('conversation_id, sender_id, body, read_at, created_at, attachment').in('conversation_id', rows.map((r) => r.id)).order('created_at', { ascending: false }).limit(500),
  ]);
  const names = new Map(((profiles.data ?? []) as { id: string; full_name: string; handle: string | null; avatar_path: string | null; available_until: string | null }[]).map((p) => [p.id, p]));
  const msgs = (messages.data ?? []) as { conversation_id: string; sender_id: string; body: string; read_at: string | null; attachment: ChatAttachment | null }[];
  return rows.map((r) => {
    const otherId = r.user_a === me ? r.user_b : r.user_a;
    const mine = msgs.filter((m) => m.conversation_id === r.id);
    return {
      id: r.id,
      otherId,
      otherName: names.get(otherId)?.full_name ?? '',
      otherHandle: names.get(otherId)?.handle ?? null,
      otherAvatar: names.get(otherId)?.avatar_path ?? null,
      availableNow: !!names.get(otherId)?.available_until && Date.parse(names.get(otherId)?.available_until ?? '') > Date.now(),
      lastAt: r.last_message_at,
      lastBody: mine[0]?.body || previewOf(mine[0]?.attachment ?? null),
      unread: mine.filter((m) => m.sender_id !== me && !m.read_at).length,
    };
  });
}

export const CHAT_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt', 'text/csv': 'csv',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
};
const CHAT_MAX = 25 * 1024 * 1024;

/** Carica un allegato nella cartella privata della conversazione e invia il messaggio che lo contiene. */
export async function sendAttachment(conversationId: string, senderId: string, file: { uri: string; name: string; mime: string; durationMs?: number }, lang: string): Promise<string | null> {
  const ext = CHAT_MIME[file.mime];
  if (!ext) return 'chat.errors.type';
  const blob = await (await fetch(file.uri)).blob();
  if (blob.size > CHAT_MAX) return 'chat.errors.size';
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from('chat-media').upload(path, blob, { contentType: file.mime });
  if (up.error) return 'errors.generic';
  const type = file.mime.startsWith('image/') ? 'image' : file.mime.startsWith('video/') ? 'video' : file.mime.startsWith('audio/') ? 'audio' : 'file';
  const attachment: MediaAttachment = { kind: 'media', type, path, name: file.name, size: blob.size, mime: file.mime, ...(file.durationMs ? { durationMs: file.durationMs } : {}) };
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: '', lang, attachment });
  if (error) {
    await supabase.storage.from('chat-media').remove([path]);
    return 'errors.generic';
  }
  return null;
}

/** Invia un biglietto (profilo o slot): `preview` è il testo breve per l'elenco delle conversazioni. */
export async function sendCard(conversationId: string, senderId: string, card: ProfileCard | SlotCard, lang: string): Promise<string | null> {
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: '', lang, attachment: card });
  return error ? 'errors.generic' : null;
}

/** Persone con cui hai già una conversazione: si possono condividere come contatto. */
export async function listShareableProfiles(me: string, exceptId: string): Promise<ProfileCard[]> {
  const list = await listConversations(me);
  return list.filter((c) => c.otherId !== exceptId).map((c) => ({ kind: 'profile' as const, id: c.otherId, name: c.otherName, handle: c.otherHandle, avatar: c.otherAvatar }));
}

/** Indirizzi temporanei (1 ora) per mostrare gli allegati privati. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from('chat-media').createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export async function isBlockedByMe(me: string, other: string): Promise<boolean> {
  const { data } = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', me).eq('blocked_id', other).maybeSingle();
  return !!data;
}
export async function setBlocked(other: string, blocked: boolean): Promise<void> {
  await supabase.rpc(blocked ? 'block_user' : 'unblock_user', { target: other });
}
export async function reportMessage(me: string, messageId: string, reason: string): Promise<string | null> {
  const { error } = await supabase.from('reports').insert({ reporter_id: me, entity_type: 'message', entity_id: messageId, reason });
  return error ? 'errors.generic' : null;
}

export type ReactionKey = 'fire' | 'raising_hands' | 'heart_hands' | 'thumbs_up' | 'smiling_eyes' | 'party_popper';
export const REACTIONS: ReactionKey[] = ['fire', 'raising_hands', 'heart_hands', 'thumbs_up', 'smiling_eyes', 'party_popper'];
/** messaggio → reazioni (una per persona) */
export type ReactionMap = Record<string, { userId: string; emoji: ReactionKey }[]>;

export async function loadReactions(conversationId: string): Promise<ReactionMap> {
  const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').eq('conversation_id', conversationId);
  const map: ReactionMap = {};
  for (const r of (data ?? []) as { message_id: string; user_id: string; emoji: ReactionKey }[]) (map[r.message_id] ??= []).push({ userId: r.user_id, emoji: r.emoji });
  return map;
}

/** Imposta la propria reazione; la stessa emoji una seconda volta la toglie. */
export async function toggleReaction(conversationId: string, messageId: string, me: string, emoji: ReactionKey, current: ReactionKey | null): Promise<string | null> {
  if (current === emoji) {
    const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me);
    return error ? 'errors.generic' : null;
  }
  const { error } = await supabase.from('message_reactions').upsert({ message_id: messageId, user_id: me, conversation_id: conversationId, emoji }, { onConflict: 'message_id,user_id' });
  return error ? 'errors.generic' : null;
}

export type ChatBooking = { id: string; created_at: string; starts_at: string; ends_at: string; service_title: string; place: 'online' | 'sede' | 'domicilio'; price_cents: number; extra_cents: number; status: string };

/** Prenotazioni fra le due persone (non annullate): compaiono nella conversazione come card. */
export async function loadChatBookings(me: string, other: string): Promise<ChatBooking[]> {
  const { data } = await supabase
    .from('bookings')
    .select('id, created_at, starts_at, ends_at, service_title, place, price_cents, extra_cents, status')
    .or(`and(client_id.eq.${me},seller_id.eq.${other}),and(client_id.eq.${other},seller_id.eq.${me})`)
    .in('status', ['confirmed', 'completed'])
    .order('created_at', { ascending: false })
    .limit(10);
  return (data ?? []) as ChatBooking[];
}
