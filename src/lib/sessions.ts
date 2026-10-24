import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform, Share } from 'react-native';
import { supabase } from '@/lib/supabase';

export type SessionDetail = {
  id: string;
  client_id: string;
  seller_id: string;
  service_id: string | null;
  service_title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  place: 'online' | 'sede' | 'domicilio';
  client_address: string | null;
  price_cents: number;
  extra_cents: number;
  client_fee_cents: number;
  seller_fee_cents: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  refund_cents: number;
  package_id: string | null;
  packagePosition: { index: number; total: number } | null;
  client: { full_name: string; handle: string | null };
  seller: { full_name: string; handle: string | null };
  paid: boolean; // pagamento incassato
  tipsCents: number; // mance incassate
  review: { rating: number; body: string | null } | null;
  requests: { kind: 'receipt' | 'invoice'; status: 'open' | 'done' }[];
};

type Person = { full_name: string; handle: string | null };
type Row = Omit<SessionDetail, 'description' | 'packagePosition' | 'client' | 'seller' | 'paid' | 'tipsCents' | 'review' | 'requests'> & {
  clientp: Person | Person[] | null;
  sellerp: Person | Person[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function loadSession(id: string): Promise<SessionDetail | null> {
  const { data } = await supabase
    .from('bookings')
    .select(
      'id, client_id, seller_id, service_id, service_title, starts_at, ends_at, place, client_address, price_cents, extra_cents, client_fee_cents, seller_fee_cents, status, refund_cents, package_id, clientp:profiles!bookings_client_id_fkey(full_name, handle), sellerp:profiles!bookings_seller_id_fkey(full_name, handle)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Row;
  const [service, payments, tips, review, requests, pack] = await Promise.all([
    row.service_id ? supabase.from('services').select('description').eq('id', row.service_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('payments').select('status').or(row.package_id ? `package_id.eq.${row.package_id}` : `booking_id.eq.${row.id}`),
    supabase.from('payments').select('captured_cents, status').eq('tip_booking_id', row.id),
    supabase.from('reviews').select('rating, body').eq('booking_id', row.id).maybeSingle(),
    supabase.from('invoice_requests').select('kind, status').eq('booking_id', row.id),
    row.package_id ? supabase.from('bookings').select('id').eq('package_id', row.package_id).order('starts_at') : Promise.resolve({ data: null }),
  ]);
  const packIds = ((pack.data ?? []) as { id: string }[]).map((b) => b.id);
  const { clientp, sellerp, ...rest } = row;
  return {
    ...rest,
    description: (service.data as { description: string | null } | null)?.description ?? null,
    packagePosition: packIds.length > 0 ? { index: packIds.indexOf(row.id) + 1, total: packIds.length } : null,
    client: one(clientp) ?? { full_name: '', handle: null },
    seller: one(sellerp) ?? { full_name: '', handle: null },
    paid: ((payments.data ?? []) as { status: string }[]).some((p) => p.status === 'captured' || p.status === 'refunded'),
    tipsCents: ((tips.data ?? []) as { captured_cents: number; status: string }[]).reduce((s, p) => s + (p.status === 'captured' ? p.captured_cents : 0), 0),
    review: (review.data as { rating: number; body: string | null } | null) ?? null,
    requests: (requests.data ?? []) as SessionDetail['requests'],
  };
}

export async function requestInvoice(bookingId: string, requesterId: string, kind: 'receipt' | 'invoice', details: string): Promise<string | null> {
  const { error } = await supabase.from('invoice_requests').insert({ booking_id: bookingId, requester_id: requesterId, kind, details: details.trim() || null });
  if (!error) return null;
  return error.code === '23505' ? 'session.requestExists' : 'errors.generic';
}

export async function createTipPayment(bookingId: string, amountCents: number): Promise<{ payment: { client_secret: string; stripe_account: string; amount_cents: number } | null; errorKey: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ client_secret: string; stripe_account: string; amount_cents: number }>('create-tip-payment', {
    body: { booking_id: bookingId, amount_cents: amountCents },
  });
  if (!error && data) return { payment: data, errorKey: null };
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'bad_amount' || body?.error === 'not_completed' || body?.error === 'seller_not_ready') return { payment: null, errorKey: `session.tipErrors.${body.error}` };
  }
  return { payment: null, errorKey: 'errors.generic' };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Riepilogo da stampare: sul web apre la stampa del browser, sul telefono il foglio di condivisione con il testo. */
export async function printSummary(title: string, lines: string[]): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Inter,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#111}h1{font-size:22px}p{margin:6px 0;font-size:15px}</style></head><body><h1>${esc(title)}</h1>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</body></html>`,
    );
    w.document.close();
    w.focus();
    w.print();
    return;
  }
  await Share.share({ title, message: `${title}\n\n${lines.join('\n')}` });
}
