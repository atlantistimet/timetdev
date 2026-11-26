// Notifica di prova: chi è connesso si manda una push sui propri dispositivi, per controllare che arrivino.
// Chiamata dall'app con la sessione dell'utente (nessun corpo). Risposta: { sent, devices }.
// Non crea nessuna notifica nell'app: è solo un messaggio a Expo Push Service verso i token dell'utente.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  // Chi è l'utente: lo dice il token di sessione, mai il corpo della richiesta.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const [{ data: devices }, { data: profile }] = await Promise.all([
    admin.from('push_devices').select('token').eq('user_id', userId),
    admin.from('profiles').select('preferred_lang').eq('id', userId).maybeSingle(),
  ]);
  const tokens = (devices ?? []).map((d) => d.token as string);
  if (!tokens.length) return json({ sent: 0, devices: 0 });

  const body = profile?.preferred_lang === 'en' ? 'It works! Notifications reach this phone.' : 'Funziona! Le notifiche arrivano su questo telefono.';
  const messages = tokens.map((to) => ({ to, body, sound: 'default', channelId: 'default', priority: 'high', data: { test: true } }));
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const access = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(EXPO_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) {
    console.error('Expo push (prova): risposta non valida', res.status, await res.text());
    return json({ error: 'expo_failed' }, 502);
  }
  const tickets = ((await res.json()) as { data?: { status: string; details?: { error?: string } }[] }).data ?? [];
  const dead: string[] = [];
  let sent = 0;
  tickets.forEach((t, i) => {
    if (t.status === 'ok') sent++;
    else if (t.details?.error === 'DeviceNotRegistered') dead.push(tokens[i]);
  });
  if (dead.length) await admin.from('push_devices').delete().in('token', dead);
  return json({ sent, devices: tokens.length });
});
