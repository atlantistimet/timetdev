import { supabase } from '@/lib/supabase';
import { parseEuroToCents } from '@/lib/my-services';

export type MyProfile = {
  handle: string | null;
  role_title: string | null;
  available_until: string | null;
  city: string | null;
  bio: string | null;
  place_type: string | null;
  place_address: string | null;
  service_area: string | null;
  travel_fee_cents: number;
  avatar_path: string | null;
};

const COLUMNS = 'handle, available_until, role_title, city, bio, place_type, place_address, service_area, travel_fee_cents, avatar_path';

export const HANDLE_RE = /^[a-z0-9_.]{3,30}$/;

export async function loadMyProfile(userId: string): Promise<MyProfile | null> {
  const { data } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  return (data as MyProfile | null) ?? null;
}

export type ProfileInput = {
  handle: string;
  roleTitle: string;
  city: string;
  bio: string;
  placeType: string;
  placeAddress: string;
  serviceArea: string;
  travelFee: string;
};

/** Restituisce la chiave di traduzione dell'errore o null. */
export async function saveMyProfile(userId: string, input: ProfileInput): Promise<string | null> {
  const handle = input.handle.trim().toLowerCase();
  if (handle && !HANDLE_RE.test(handle)) return 'profileEdit.errors.handle';
  const travel = input.travelFee.trim() ? parseEuroToCents(input.travelFee) : 0;
  if (travel === null || travel > 100_000) return 'profileEdit.errors.travel';
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  const { error } = await supabase
    .from('profiles')
    .update({
      handle: handle || null,
      role_title: orNull(input.roleTitle),
      city: orNull(input.city),
      bio: orNull(input.bio),
      place_type: orNull(input.placeType),
      place_address: orNull(input.placeAddress),
      service_area: orNull(input.serviceArea),
      travel_fee_cents: travel,
    })
    .eq('id', userId);
  if (error) return error.code === '23505' ? 'profileEdit.errors.handleTaken' : 'errors.generic';
  return null;
}

export type MyStats = { hours: number; people: number; moments: number; services: number };

/** Numeri del proprio profilo: ore condivise e persone (sessioni concluse), momenti pubblicati, servizi attivi. */
export async function loadMyStats(userId: string): Promise<MyStats> {
  const [b, p, s] = await Promise.all([
    supabase.from('bookings').select('client_id, starts_at, ends_at').eq('seller_id', userId).eq('status', 'completed').limit(1000),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId),
    supabase.from('services').select('id', { count: 'exact', head: true }).eq('seller_id', userId).eq('link_only', false).is('deleted_at', null),
  ]);
  const rows = (b.data ?? []) as { client_id: string; starts_at: string; ends_at: string }[];
  const minutes = rows.reduce((sum, r) => sum + Math.max(0, (new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000), 0);
  return { hours: Math.round(minutes / 6) / 10, people: new Set(rows.map((r) => r.client_id)).size, moments: p.count ?? 0, services: s.count ?? 0 };
}
