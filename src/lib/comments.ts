import { supabase } from '@/lib/supabase';

export type Comment = { id: string; author_id: string; body: string; created_at: string; author_name: string; author_handle: string | null };

type Row = { id: string; author_id: string; body: string; created_at: string; profiles: { full_name: string; handle: string | null } | { full_name: string; handle: string | null }[] | null };

export async function loadComments(postId: string): Promise<{ comments: Comment[]; errorKey: string | null }> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, author_id, body, created_at, profiles!post_comments_author_id_fkey(full_name, handle)')
    .eq('post_id', postId)
    .order('created_at');
  if (error) return { comments: [], errorKey: 'errors.generic' };
  return {
    comments: ((data ?? []) as unknown as Row[]).map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return { id: r.id, author_id: r.author_id, body: r.body, created_at: r.created_at, author_name: p?.full_name ?? '', author_handle: p?.handle ?? null };
    }),
    errorKey: null,
  };
}

export async function addComment(postId: string, authorId: string, body: string): Promise<string | null> {
  const text = body.trim();
  if (!text) return 'comments.empty';
  const { error } = await supabase.from('post_comments').insert({ post_id: postId, author_id: authorId, body: text });
  return error ? 'errors.generic' : null;
}

export async function deleteComment(id: string): Promise<string | null> {
  const { error } = await supabase.from('post_comments').delete().eq('id', id);
  return error ? 'errors.generic' : null;
}
