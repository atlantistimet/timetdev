import { type MediaItem } from '@/lib/media';
import { supabase } from '@/lib/supabase';

export type PostKind = 'update' | 'offer' | 'slots';

export type Post = {
  id: string;
  author_id: string;
  kind: PostKind;
  body: string;
  created_at: string;
  offer_id: string | null;
  service_id: string | null;
  slot_link_id: string | null;
  author: { full_name: string; handle: string | null; role_title: string | null };
  media: MediaItem[];
  likes: number;
  liked: boolean;
  offer: { price_cents: number; discount_pct: number; duration_min: number; service_id: string; service_title: string } | null;
  link: { code: string; price_cents: number; discount_pct: number; duration_min: number; days: string[]; expires_at: string | null; preview: MediaItem | null; service_title: string } | null;
};

type Row = {
  id: string;
  author_id: string;
  kind: PostKind;
  body: string;
  created_at: string;
  offer_id: string | null;
  service_id: string | null;
  slot_link_id: string | null;
  profiles: Post['author'] | Post['author'][] | null;
  post_media: { path: string; type: 'image' | 'video'; position: number }[] | null;
  post_likes: { count: number }[] | null;
  offers: { price_cents: number; discount_pct: number; duration_min: number; service_id: string; services: { title: string } | { title: string }[] | null } | null;
  slot_links: {
    code: string; price_cents: number; discount_pct: number; duration_min: number; days: string[]; expires_at: string | null;
    preview_path: string | null; preview_type: 'image' | 'video' | null; services: { title: string } | { title: string }[] | null;
  } | null;
};

const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const SELECT = `id, author_id, kind, body, created_at, offer_id, service_id, slot_link_id,
  profiles!posts_author_id_fkey(full_name, handle, role_title),
  post_media(path, type, position),
  post_likes(count),
  offers(price_cents, discount_pct, duration_min, service_id, services(title)),
  slot_links(code, price_cents, discount_pct, duration_min, days, expires_at, preview_path, preview_type, services(title))`;

async function hydrate(rows: Row[], userId: string): Promise<Post[]> {
  const ids = rows.map((r) => r.id);
  const likedSet = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase.from('post_likes').select('post_id').eq('user_id', userId).in('post_id', ids);
    for (const l of (data ?? []) as { post_id: string }[]) likedSet.add(l.post_id);
  }
  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    kind: r.kind,
    body: r.body,
    created_at: r.created_at,
    offer_id: r.offer_id,
    service_id: r.service_id,
    slot_link_id: r.slot_link_id,
    author: first(r.profiles) ?? { full_name: '', handle: null, role_title: null },
    media: [...(r.post_media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ path: m.path, type: m.type })),
    likes: r.post_likes?.[0]?.count ?? 0,
    liked: likedSet.has(r.id),
    offer: r.offers ? { ...r.offers, service_title: first(r.offers.services)?.title ?? '' } : null,
    link: r.slot_links
      ? {
          code: r.slot_links.code, price_cents: r.slot_links.price_cents, discount_pct: r.slot_links.discount_pct,
          duration_min: r.slot_links.duration_min, days: r.slot_links.days, expires_at: r.slot_links.expires_at,
          preview: r.slot_links.preview_path && r.slot_links.preview_type ? { path: r.slot_links.preview_path, type: r.slot_links.preview_type } : null,
          service_title: first(r.slot_links.services)?.title ?? '',
        }
      : null,
  }));
}

/** Post recenti: di tutti, di chi segui oppure di un solo autore. */
export async function loadPosts(userId: string, scope: { kind: 'all' } | { kind: 'following' } | { kind: 'author'; authorId: string }): Promise<{ posts: Post[]; errorKey: string | null }> {
  let query = supabase.from('posts').select(SELECT).is('deleted_at', null).order('created_at', { ascending: false }).limit(40);
  if (scope.kind === 'author') {
    query = query.eq('author_id', scope.authorId);
  } else if (scope.kind === 'following') {
    const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', userId);
    const ids = ((f ?? []) as { followee_id: string }[]).map((x) => x.followee_id);
    if (ids.length === 0) return { posts: [], errorKey: null };
    query = query.in('author_id', ids);
  }
  const { data, error } = await query;
  if (error) return { posts: [], errorKey: 'errors.generic' };
  return { posts: await hydrate(data as unknown as Row[], userId), errorKey: null };
}

export async function createPost(input: {
  authorId: string;
  kind: PostKind;
  body: string;
  lang: string;
  media: MediaItem[];
  offerId?: string;
  serviceId?: string;
  slotLinkId?: string;
}): Promise<{ id: string | null; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: input.authorId,
      kind: input.kind,
      body: input.body.trim(),
      lang: input.lang,
      offer_id: input.offerId ?? null,
      service_id: input.serviceId ?? null,
      slot_link_id: input.slotLinkId ?? null,
    })
    .select('id')
    .single();
  if (error || !data) return { id: null, errorKey: 'errors.generic' };
  if (input.media.length > 0) {
    const { error: mediaError } = await supabase
      .from('post_media')
      .insert(input.media.map((m, i) => ({ post_id: data.id, path: m.path, type: m.type, position: i })));
    if (mediaError) return { id: data.id, errorKey: 'errors.generic' };
  }
  return { id: data.id, errorKey: null };
}

export async function deletePost(id: string): Promise<string | null> {
  const { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  return error ? 'errors.generic' : null;
}

export async function setLike(postId: string, userId: string, like: boolean): Promise<string | null> {
  const { error } = like
    ? await supabase.from('post_likes').insert({ post_id: postId, user_id: userId })
    : await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  return error ? 'errors.generic' : null;
}

export async function followInfo(userId: string, profileId: string): Promise<{ following: boolean; followers: number; followingCount: number }> {
  const [mine, followers, following] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', userId).eq('followee_id', profileId).maybeSingle(),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', profileId),
    supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', profileId),
  ]);
  return { following: !!mine.data, followers: followers.count ?? 0, followingCount: following.count ?? 0 };
}

export async function setFollow(userId: string, profileId: string, follow: boolean): Promise<string | null> {
  const { error } = follow
    ? await supabase.from('follows').insert({ follower_id: userId, followee_id: profileId })
    : await supabase.from('follows').delete().eq('follower_id', userId).eq('followee_id', profileId);
  return error ? 'errors.generic' : null;
}
