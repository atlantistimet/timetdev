// Check-in con QR (migrazione 0040): chi MOSTRA il QR chiede il token della finestra corrente.
// Sede (luogo del venditore): mostra il venditore. Domicilio: mostra il cliente. Lo decide il database (checkin_shower).
// Chiamata dall'app con la sessione dell'utente, ogni volta che il token sta per scadere (expires_in).
// Corpo: { booking_id }. Risposta: { token, code, expires_in, url }.
// Errori: not_found, wrong_party, already_checked_in, too_early (prima di 15 minuti dall'inizio), too_late.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CHECKIN_HTTP, checkinCredentials, normalizeBookingId } from '../_shared/checkin.ts';
import { corsHeaders, json } from '../_shared/http.ts';

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

  const body = (await req.json().catch(() => ({}))) as { booking_id?: unknown };
  const bookingId = normalizeBookingId(body.booking_id);
  if (!bookingId) return json({ error: 'bad_request' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: status, error } = await admin.rpc('checkin_status', { p_booking: bookingId, p_user: userData.user.id, p_role: 'show' });
  if (error) {
    console.error('checkin_status fallita', bookingId, error);
    return json({ error: 'server_error' }, 500);
  }
  if (status !== 'ok') return json({ error: status }, CHECKIN_HTTP[status as string] ?? 409);

  try {
    const { token, code, expiresIn } = await checkinCredentials(bookingId);
    const base = (Deno.env.get('PUBLIC_PROFILE_BASE_URL') ?? 'https://timeet.world').replace(/\/+$/, '');
    return json({ token, code, expires_in: expiresIn, url: `${base}/checkin/${bookingId}/${token}` });
  } catch (e) {
    console.error('Token di check-in non generato', e);
    return json({ error: 'server_error' }, 500);
  }
});
