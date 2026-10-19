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
};

const COLUMNS = 'handle, available_until, role_title, city, bio, place_type, place_address, service_area, travel_fee_cents';

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
