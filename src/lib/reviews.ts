import { supabase } from '@/lib/supabase';

export type Review = { id: string; rating: number; body: string | null; created_at: string; author_name: string; author_handle: string | null };
export type ReviewSummary = { count: number; average: number };

type Row = { id: string; rating: number; body: string | null; created_at: string; profiles: { full_name: string; handle: string | null } | { full_name: string; handle: string | null }[] | null };

export async function loadReviews(sellerId: string): Promise<{ reviews: Review[]; summary: ReviewSummary }> {
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, body, created_at, profiles!reviews_author_id_fkey(full_name, handle)')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(50);
  const reviews = ((data ?? []) as unknown as Row[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { id: r.id, rating: r.rating, body: r.body, created_at: r.created_at, author_name: p?.full_name ?? '', author_handle: p?.handle ?? null };
  });
  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return { reviews, summary: { count: reviews.length, average } };
}

/** Prenotazioni che l'utente ha già recensito. */
export async function reviewedBookingIds(authorId: string): Promise<Set<string>> {
  const { data } = await supabase.from('reviews').select('booking_id').eq('author_id', authorId);
  return new Set(((data ?? []) as { booking_id: string }[]).map((r) => r.booking_id));
}

export async function createReview(input: { bookingId: string; authorId: string; sellerId: string; rating: number; body: string; lang: string }): Promise<string | null> {
  const { error } = await supabase.from('reviews').insert({
    booking_id: input.bookingId,
    author_id: input.authorId,
    seller_id: input.sellerId,
    rating: input.rating,
    body: input.body.trim() || null,
    lang: input.lang,
  });
  if (!error) return null;
  return error.code === '23505' ? 'reviews.already' : 'errors.generic';
}

export const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
