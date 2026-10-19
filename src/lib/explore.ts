import { supabase } from '@/lib/supabase';

export type Category = { key: string; name: string };
export type Seller = { id: string; full_name: string; handle: string | null; role_title: string | null; city: string | null; available_until: string | null; categories: string[] };

export async function loadCategories(language: string): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('key, names, sort_order').order('sort_order');
  return ((data ?? []) as { key: string; names: Record<string, string> }[]).map((c) => ({ key: c.key, name: c.names[language] ?? c.names.it ?? c.key }));
}

export async function loadSellers(ids: string[]): Promise<Record<string, Seller>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, handle, role_title, city, available_until, profile_categories(category_key)')
    .in('id', [...new Set(ids)]);
  const map: Record<string, Seller> = {};
  for (const row of (data ?? []) as unknown as (Omit<Seller, 'categories'> & { profile_categories: { category_key: string }[] | null })[]) {
    const { profile_categories, ...rest } = row;
    map[row.id] = { ...rest, categories: (profile_categories ?? []).map((c) => c.category_key) };
  }
  return map;
}

export const isAvailableNow = (seller: Seller | undefined, nowMs: number) => !!seller?.available_until && new Date(seller.available_until).getTime() > nowMs;

/** "Disponibile ora" per un certo numero di ore, oppure spento (null). */
export async function setAvailableNow(userId: string, hours: number | null): Promise<string | null> {
  const until = hours ? new Date(Date.now() + hours * 3_600_000).toISOString() : null;
  const { error } = await supabase.from('profiles').update({ available_until: until }).eq('id', userId);
  return error ? 'errors.generic' : null;
}

export async function loadMyCategories(userId: string): Promise<string[]> {
  const { data } = await supabase.from('profile_categories').select('category_key').eq('profile_id', userId);
  return ((data ?? []) as { category_key: string }[]).map((c) => c.category_key);
}

export const MAX_CATEGORIES = 3;

export async function saveMyCategories(userId: string, keys: string[]): Promise<string | null> {
  const del = await supabase.from('profile_categories').delete().eq('profile_id', userId);
  if (del.error) return 'errors.generic';
  if (keys.length === 0) return null;
  const ins = await supabase.from('profile_categories').insert(keys.slice(0, MAX_CATEGORIES).map((k) => ({ profile_id: userId, category_key: k })));
  return ins.error ? 'errors.generic' : null;
}
