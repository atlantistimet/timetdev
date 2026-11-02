import { supabase } from '@/lib/supabase';

export type Movement = {
  id: string;
  kind: 'booking' | 'package' | 'call' | 'tip' | 'refund';
  title: string;
  payerName: string;
  payerId: string;
  payerAvatar: string | null;
  at: string;
  netCents: number; // con segno: negativo per i rimborsi
  grossCents: number; // incassato dal cliente, senza la nostra commissione
  feeCents: number;
  minutes: number | null;
};

export type Earnings = { netCents: number; count: number; feeCents: number; movements: Movement[] };

type Row = {
  id: string;
  status: string;
  amount_cents: number;
  captured_cents: number;
  refunded_cents: number;
  application_fee_cents: number;
  application_fee_refunded_cents: number;
  booking_id: string | null;
  package_id: string | null;
  call_id: string | null;
  tip_booking_id: string | null;
  call_minutes: number | null;
  created_at: string;
  payer_id: string;
  payer: { full_name: string; avatar_path: string | null } | { full_name: string; avatar_path: string | null }[] | null;
};

/** Incassi del venditore nel periodo: importo netto (meno la nostra commissione e i rimborsi). */
export async function loadEarnings(sellerId: string, fromIso: string, toIso: string): Promise<{ data: Earnings | null; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, status, amount_cents, captured_cents, refunded_cents, application_fee_cents, application_fee_refunded_cents, booking_id, package_id, call_id, tip_booking_id, call_minutes, created_at, payer_id, payer:profiles!payments_payer_id_fkey(full_name, avatar_path)',
    )
    .eq('seller_id', sellerId)
    .in('status', ['captured', 'refunded'])
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { data: null, errorKey: 'errors.generic' };
  const rows = (data ?? []) as unknown as Row[];
  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter((x): x is string => !!x))];
  const titles: Record<string, string> = {};
  if (bookingIds.length > 0) {
    const { data: b } = await supabase.from('bookings').select('id, service_title').in('id', bookingIds);
    for (const x of (b ?? []) as { id: string; service_title: string }[]) titles[x.id] = x.service_title;
  }
  const movements: Movement[] = [];
  let net = 0;
  let fees = 0;
  for (const r of rows) {
    const person = Array.isArray(r.payer) ? r.payer[0] : r.payer;
    const fee = r.application_fee_cents - r.application_fee_refunded_cents;
    const kept = r.captured_cents - r.refunded_cents - fee;
    const base = {
      payerName: person?.full_name ?? '',
      payerId: r.payer_id,
      payerAvatar: person?.avatar_path ?? null,
      at: r.created_at,
      minutes: r.call_minutes,
    };
    const kind: Movement['kind'] = r.tip_booking_id ? 'tip' : r.call_id ? 'call' : r.package_id ? 'package' : 'booking';
    const title = r.booking_id ? (titles[r.booking_id] ?? '') : '';
    net += kept;
    fees += fee;
    movements.push({ ...base, id: r.id, kind, title, netCents: kept, grossCents: r.captured_cents - r.refunded_cents, feeCents: fee });
  }
  return { data: { netCents: net, count: rows.length, feeCents: fees, movements }, errorKey: null };
}
