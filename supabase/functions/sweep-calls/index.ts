// Controllo ogni minuto delle chiamate (pg_cron): chiamate rimaste a squillare, linee cadute, prolungamenti,
// incassi o rilasci rimasti a metà. Protetta dal segreto `CRON_SECRET` (header `x-cron-secret`).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { json } from '../_shared/http.ts';
import { CALL_COLUMNS, settleCall, tickCall, type CallRow } from '../_shared/calls.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: live } = await admin.from('calls').select(CALL_COLUMNS).in('status', ['awaiting_payment', 'ringing', 'active']).limit(200);
  let ticked = 0;
  for (const call of (live ?? []) as CallRow[]) {
    try { await tickCall(admin, call); ticked++; } catch (error) { console.error('Controllo chiamata fallito', call.id, error); }
  }
  // chiamate concluse ma con soldi da sistemare (errore Stripe temporaneo): si riprova
  const { data: pending } = await admin.from('calls').select(CALL_COLUMNS).is('settled_at', null).in('status', ['ended', 'missed', 'declined', 'cancelled']).limit(100);
  let settled = 0;
  for (const call of (pending ?? []) as CallRow[]) {
    try { await settleCall(admin, call); settled++; } catch (error) { console.error('Incasso chiamata fallito', call.id, error); }
  }
  return json({ ticked, settled });
});
