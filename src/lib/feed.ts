import { type MediaItem } from '@/lib/media';
import { supabase } from '@/lib/supabase';

export type PostTag = { tagged_id: string; status: 'pending' | 'accepted' | 'declined' | 'removed'; full_name: string; handle: string | null };
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
  author: { full_name: string; handle: string | null; role_title: string | null; available_until: string | null };
  media: MediaItem[];
  tags: PostTag[];
  likes: number;
  liked: boolean;
  comments: number;
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
  post_tags: { tagged_id: string; status: PostTag['status']; profiles: { full_name: string; handle: string | null } | { full_name: string; handle: string | null }[] | null }[] | null;
  post_likes: { count: number }[] | null;
  post_comments: { count: number }[] | null;
  offers: { price_cents: number; discount_pct: number; duration_min: number; service_id: string; services: { title: string } | { title: string }[] | null } | null;
  slot_links: {
    code: string; price_cents: number; discount_pct: number; duration_min: number; days: string[]; expires_at: string | null;
    preview_path: string | null; preview_type: 'image' | 'video' | null; services: { title: string } | { title: string }[] | null;
  } | null;
};

const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const SELECT = `id, author_id, kind, body, created_at, offer_id, service_id, slot_link_id,
  profiles!posts_author_id_fkey(full_name, handle, role_title, available_until),
  post_media(path, type, position),
  post_tags(tagged_id, status, profiles!post_tags_tagged_id_fkey(full_name, handle)),
  post_likes(count),
  post_comments(count),
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
    author: first(r.profiles) ?? { full_name: '', handle: null, role_title: null, available_until: null },
    media: [...(r.post_media ?? [])].sort((a, b) => a.position - b.position).map((m) => ({ path: m.path, type: m.type })),
    tags: (r.post_tags ?? [])
      .filter((x) => x.status === 'accepted' || x.status === 'pending')
      .map((x) => ({ tagged_id: x.tagged_id, status: x.status, full_name: first(x.profiles)?.full_name ?? '', handle: first(x.profiles)?.handle ?? null })),
    likes: r.post_likes?.[0]?.count ?? 0,
    liked: likedSet.has(r.id),
    comments: r.post_comments?.[0]?.count ?? 0,
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
  tagIds?: string[];
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
  if (input.tagIds && input.tagIds.length > 0) {
    const { error: tagError } = await supabase.from('post_tags').insert(input.tagIds.slice(0, MAX_TAGS).map((tagged_id) => ({ post_id: data.id, tagged_id })));
    if (tagError) return { id: data.id, errorKey: 'errors.generic' };
  }
  return { id: data.id, errorKey: null };
}

export const MAX_TAGS = 5;

export type PersonHit = { id: string; full_name: string; handle: string | null };

/** Cerca persone per nome o @handle, per taggarle. */
export async function searchPeople(text: string, excludeId: string): Promise<PersonHit[]> {
  const q = text.trim().replace(/^@/, '').replace(/[%,()]/g, ' ');
  if (q.length < 2) return [];
  const { data } = await supabase.from('profiles').select('id, full_name, handle').or(`full_name.ilike.%${q}%,handle.ilike.%${q}%`).neq('id', excludeId).limit(6);
  return (data ?? []) as PersonHit[];
}

/** Chi è taggato accetta o rifiuta (o toglie il proprio tag). */
export async function answerTag(postId: string, userId: string, status: 'accepted' | 'declined' | 'removed'): Promise<string | null> {
  const { error } = await supabase.from('post_tags').update({ status, responded_at: new Date().toISOString() }).eq('post_id', postId).eq('tagged_id', userId);
  return error ? 'errors.generic' : null;
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

export async function loadPostById(id: string, userId: string): Promise<Post | null> {
  const { data } = await supabase.from('posts').select(SELECT).eq('id', id).is('deleted_at', null).maybeSingle();
  if (!data) return null;
  return (await hydrate([data as unknown as Row], userId))[0] ?? null;
}

/** L'autore aggiunge o toglie un tag a un post già pubblicato. Null se è andata bene, altrimenti la chiave dell'errore. */
export async function setPostTag(postId: string, userId: string, add: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_post_tag', { p_post: postId, p_user: userId, p_add: add });
  if (error) return 'errors.generic';
  return data === 'ok' ? null : data === 'max' ? 'feed.tagErrors.max' : data === 'declined' ? 'feed.tagErrors.declined' : 'errors.generic';
}
