import { supabase } from '@/lib/supabase';

export type Category = { key: string; name: string; emoji: string | null; parentKey: string | null };
export type Seller = { id: string; full_name: string; handle: string | null; role_title: string | null; city: string | null; available_until: string | null; avatar_path: string | null; categories: string[] };

/** Categorie attive. Di default solo quelle principali; con `all` anche le sottocategorie. */
export async function loadCategories(language: string, all = false): Promise<Category[]> {
  const { data } = await supabase.from('categories').select('key, names, sort_order, emoji, parent_key').eq('active', true).order('sort_order');
  const rows = ((data ?? []) as { key: string; names: Record<string, string>; emoji: string | null; parent_key: string | null }[]).map((c) => ({
    key: c.key,
    name: c.names[language] ?? c.names.it ?? c.key,
    emoji: c.emoji,
    parentKey: c.parent_key,
  }));
  return all ? rows : rows.filter((c) => !c.parentKey);
}

export type SellerStats = { rating_avg: number | null; reviews_count: number; hours_shared: number; sessions_count: number; reviewers_count: number; reviewers: { id: string; full_name: string; avatar_path: string | null }[] };

export async function loadSellerStats(ids: string[]): Promise<Record<string, SellerStats>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.rpc('seller_stats', { p_ids: [...new Set(ids)] });
  const map: Record<string, SellerStats> = {};
  for (const row of (data ?? []) as (SellerStats & { seller_id: string })[]) map[row.seller_id] = { ...row, reviewers: row.reviewers ?? [] };
  return map;
}

export type ServiceRating = { rating_avg: number | null; reviews_count: number };

export async function loadServiceRatings(ids: string[]): Promise<Record<string, ServiceRating>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.rpc('service_ratings', { p_ids: [...new Set(ids)] });
  const map: Record<string, ServiceRating> = {};
  for (const row of (data ?? []) as (ServiceRating & { service_id: string })[]) map[row.service_id] = row;
  return map;
}

export async function loadSellers(ids: string[]): Promise<Record<string, Seller>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, handle, role_title, city, available_until, avatar_path, profile_categories(category_key)')
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
