import { supabase } from '@/lib/supabase';

export type PublicProfile = {
  id: string;
  handle: string | null;
  full_name: string;
  role_title: string | null;
  city: string | null;
  bio: string | null;
  place_type: string | null;
  place_address: string | null;
  service_area: string | null;
  travel_fee_cents: number;
  is_verified: boolean;
  available_until: string | null;
};

const COLUMNS = 'id, handle, full_name, role_title, city, bio, place_type, place_address, service_area, travel_fee_cents, is_verified, available_until';

export async function loadProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const { data } = await supabase.from('profiles').select(COLUMNS).eq('handle', handle.toLowerCase()).maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

export async function loadProfileById(id: string): Promise<PublicProfile | null> {
  const { data } = await supabase.from('profiles').select(COLUMNS).eq('id', id).maybeSingle();
  return (data as PublicProfile | null) ?? null;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';
