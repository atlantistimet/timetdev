// Elimina l'account di chi la chiama. I dati contabili (prenotazioni, pagamenti) restano, senza dati personali.
//  - Si rifiuta se ci sono prenotazioni future confermate o una chiamata in corso (chiedi prima di annullarle).
//  - Il profilo viene anonimizzato; servizi e post spariscono; l'accesso viene chiuso e l'email liberata.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const uid = userData.user.id;
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== 'ELIMINA') return json({ error: 'bad_request' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const nowIso = new Date().toISOString();

  const { count: future } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .or(`client_id.eq.${uid},seller_id.eq.${uid}`)
    .eq('status', 'confirmed')
    .gt('ends_at', nowIso);
  if ((future ?? 0) > 0) return json({ error: 'has_bookings' }, 409);

  const { count: live } = await admin
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .or(`client_id.eq.${uid},seller_id.eq.${uid}`)
    .in('status', ['awaiting_payment', 'ringing', 'active']);
  if ((live ?? 0) > 0) return json({ error: 'has_calls' }, 409);

  const { data: before } = await admin.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();

  await admin.from('services').update({ active: false, deleted_at: nowIso }).eq('seller_id', uid).is('deleted_at', null);
  await admin.from('posts').update({ deleted_at: nowIso }).eq('author_id', uid).is('deleted_at', null);
  await admin.from('user_blocks').delete().or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);

  const { error: profileError } = await admin
    .from('profiles')
    .update({ full_name: 'Utente eliminato', handle: null, bio: null, avatar_path: null, role_title: null, city: null, place_address: null, service_area: null, available_until: null, is_seller: false, link: null, deleted_at: nowIso })
    .eq('id', uid);
  if (profileError) return json({ error: 'failed' }, 500);
  if (before?.avatar_path) await admin.storage.from('avatars').remove([before.avatar_path as string]);

  // Accesso chiuso per sempre e email liberata (si potrà registrare di nuovo con la stessa).
  const { error: authError } = await admin.auth.admin.updateUserById(uid, { email: `deleted+${uid}@timeet.invalid`, ban_duration: '876000h', user_metadata: {} });
  if (authError) return json({ error: 'failed' }, 500);
  return json({ ok: true });
});
