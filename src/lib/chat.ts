import { supabase } from '@/lib/supabase';

export type ChatAttachment = { kind: 'media'; type: 'image' | 'video' | 'file'; path: string; name: string; size: number; mime: string };
export type Message = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null; attachment: ChatAttachment | null };
export type ConversationItem = { id: string; otherId: string; otherName: string; otherHandle: string | null; lastAt: string | null; lastBody: string; unread: number };

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
  return ((data ?? []) as Message[]).map((m) => ({ ...m, attachment: m.attachment?.kind === 'media' ? m.attachment : null }));
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
    supabase.from('profiles').select('id, full_name, handle').in('id', otherIds),
    supabase.from('messages').select('conversation_id, sender_id, body, read_at, created_at, attachment').in('conversation_id', rows.map((r) => r.id)).order('created_at', { ascending: false }).limit(500),
  ]);
  const names = new Map(((profiles.data ?? []) as { id: string; full_name: string; handle: string | null }[]).map((p) => [p.id, p]));
  const msgs = (messages.data ?? []) as { conversation_id: string; sender_id: string; body: string; read_at: string | null; attachment: ChatAttachment | null }[];
  return rows.map((r) => {
    const otherId = r.user_a === me ? r.user_b : r.user_a;
    const mine = msgs.filter((m) => m.conversation_id === r.id);
    return {
      id: r.id,
      otherId,
      otherName: names.get(otherId)?.full_name ?? '',
      otherHandle: names.get(otherId)?.handle ?? null,
      lastAt: r.last_message_at,
      lastBody: mine[0]?.body || (mine[0]?.attachment ? (mine[0].attachment.type === 'image' ? '📷' : mine[0].attachment.type === 'video' ? '🎬' : '📄') : ''),
      unread: mine.filter((m) => m.sender_id !== me && !m.read_at).length,
    };
  });
}

const CHAT_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const CHAT_MAX = 25 * 1024 * 1024;

/** Carica un allegato nella cartella privata della conversazione e invia il messaggio che lo contiene. */
export async function sendAttachment(conversationId: string, senderId: string, file: { uri: string; name: string; mime: string }, lang: string): Promise<string | null> {
  const ext = CHAT_MIME[file.mime];
  if (!ext) return 'chat.errors.type';
  const blob = await (await fetch(file.uri)).blob();
  if (blob.size > CHAT_MAX) return 'chat.errors.size';
  const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await supabase.storage.from('chat-media').upload(path, blob, { contentType: file.mime });
  if (up.error) return 'errors.generic';
  const type = file.mime.startsWith('image/') ? 'image' : file.mime.startsWith('video/') ? 'video' : 'file';
  const attachment: ChatAttachment = { kind: 'media', type, path, name: file.name, size: blob.size, mime: file.mime };
  const { error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: '', lang, attachment });
  if (error) {
    await supabase.storage.from('chat-media').remove([path]);
    return 'errors.generic';
  }
  return null;
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
