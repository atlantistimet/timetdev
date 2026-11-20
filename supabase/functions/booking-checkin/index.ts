// Check-in con QR (migrazione 0040): chi ARRIVA scansiona il QR o digita il codice a 6 cifre.
// Sede (luogo del venditore): scansiona il cliente. Domicilio: scansiona il venditore. Lo decide il database (checkin_scanner).
// Il token si verifica qui, dove c'è il segreto CHECKIN_SECRET; poi checkin_booking (solo service role) ricontrolla tutto e salva.
// Corpo: { booking_id, token } (dal QR) oppure { booking_id, code } (6 cifre). Risposta: { checked_in_at }.
// Errori: not_found, wrong_party, already_checked_in, too_early, too_late, bad_token, too_many_attempts (troppi codici sbagliati).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  CHECKIN_HTTP,
  CHECKIN_MAX_CODE_FAILURES,
  CODE_PATTERN,
  normalizeBookingId,
  TOKEN_PATTERN,
  verifyCheckin,
} from '../_shared/checkin.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const fail = (status: string) => json({ error: status }, CHECKIN_HTTP[status] ?? 409);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const body = (await req.json().catch(() => ({}))) as { booking_id?: unknown; token?: unknown; code?: unknown };
  const bookingId = normalizeBookingId(body.booking_id);
  const token = typeof body.token === 'string' ? body.token.trim() : undefined;
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : undefined;
  if (!bookingId || (token === undefined) === (code === undefined)) return json({ error: 'bad_request' }, 400);
  // Un token o un codice malformato è semplicemente sbagliato.
  if (token !== undefined && !TOKEN_PATTERN.test(token)) return fail('bad_token');
  if (code !== undefined && !CODE_PATTERN.test(code)) return fail('bad_token');

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Prima le regole della prenotazione (parte giusta, orario), poi il token: a chi non c'entra non si dice nulla del token.
  const { data: status, error: statusError } = await admin.rpc('checkin_status', { p_booking: bookingId, p_user: userId, p_role: 'scan' });
  if (statusError) {
    console.error('checkin_status fallita', bookingId, statusError);
    return json({ error: 'server_error' }, 500);
  }
  if (status !== 'ok') return fail(status as string);

  if (code !== undefined) {
    const { data: row } = await admin.from('bookings').select('checkin_code_failures').eq('id', bookingId).maybeSingle();
    if ((row?.checkin_code_failures ?? 0) >= CHECKIN_MAX_CODE_FAILURES) return fail('too_many_attempts');
  }

  let valid: boolean;
  try {
    valid = await verifyCheckin(bookingId, { token, code });
  } catch (e) {
    console.error('Verifica del token di check-in non riuscita', e);
    return json({ error: 'server_error' }, 500);
  }
  if (!valid) {
    // Si contano solo i codici a 6 cifre (indovinabili); un QR scaduto non deve bloccare la prenotazione.
    if (code !== undefined) {
      const { data: failures } = await admin.rpc('checkin_code_failed', { p_booking: bookingId });
      if (typeof failures === 'number' && failures >= CHECKIN_MAX_CODE_FAILURES) return fail('too_many_attempts');
    }
    return fail('bad_token');
  }

  const { data: result, error: checkinError } = await admin.rpc('checkin_booking', { p_booking: bookingId, p_user: userId });
  if (checkinError) {
    console.error('checkin_booking fallita', bookingId, checkinError);
    return json({ error: 'server_error' }, 500);
  }
  if (result !== 'ok') return fail(result as string);

  const { data: booking } = await admin.from('bookings').select('checked_in_at').eq('id', bookingId).maybeSingle();
  return json({ checked_in_at: booking?.checked_in_at ?? new Date().toISOString() });
});
