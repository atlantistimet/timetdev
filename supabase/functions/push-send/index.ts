// Invio di una notifica push (Expo Push Service) a tutti i dispositivi di chi la riceve.
// Chiamata dal database (trigger su `notifications`, via pg_net) con il segreto `CRON_SECRET` nell'header `x-cron-secret`; body: { id }.
// Parte se la categoria della notifica non è spenta dall'utente (`notification_prefs`, 0044). `marketing_push` riguarda solo le promozioni, che oggi non esistono tra i tipi.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { PUSH_CATEGORY } from '../_shared/push-categories.ts';
import { pushBody } from '../_shared/push-texts.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const id = (await req.json().catch(() => null))?.id;
  if (typeof id !== 'string') return json({ error: 'bad_request' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: n } = await admin.from('notifications').select('id, user_id, kind, payload, read_at').eq('id', id).maybeSingle();
  if (!n || n.read_at) return json({ sent: 0 });

  // la categoria è spenta nelle scelte dell'utente: la notifica resta nell'app, ma sul telefono non arriva nulla
  const category = PUSH_CATEGORY[n.kind];
  if (category) {
    const { data: pref } = await admin.from('notification_prefs').select('push').eq('user_id', n.user_id).eq('category', category).maybeSingle();
    if (pref && pref.push === false) return json({ sent: 0, muted: true });
  }

  const [{ data: devices }, { data: profile }, { count: unread }] = await Promise.all([
    admin.from('push_devices').select('token').eq('user_id', n.user_id),
    admin.from('profiles').select('preferred_lang').eq('id', n.user_id).maybeSingle(),
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', n.user_id).is('read_at', null),
  ]);
  if (!devices?.length) return json({ sent: 0 });
  const body = pushBody(n.kind, (n.payload ?? {}) as Record<string, unknown>, profile?.preferred_lang ?? 'it');
  if (!body) return json({ sent: 0 });

  const tokens = devices.map((d) => d.token as string);
  const messages = tokens.map((to) => ({ to, body, sound: 'default', badge: unread ?? 0, channelId: 'default', priority: 'high', data: { id: n.id } }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const access = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(EXPO_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) {
    console.error('Expo push: risposta non valida', res.status, await res.text());
    return json({ error: 'expo_failed' }, 502);
  }
  const tickets = ((await res.json()) as { data?: { status: string; message?: string; details?: { error?: string } }[] }).data ?? [];
  const dead: string[] = [];
  let sent = 0;
  tickets.forEach((t, i) => {
    if (t.status === 'ok') sent++;
    else if (t.details?.error === 'DeviceNotRegistered') dead.push(tokens[i]);
    else console.error('Expo push: errore', t.details?.error ?? t.message);
  });
  // il telefono non è più raggiungibile (app disinstallata o permesso tolto): il token si cancella
  if (dead.length) await admin.from('push_devices').delete().in('token', dead);
  return json({ sent, removed: dead.length });
});
