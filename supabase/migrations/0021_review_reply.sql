-- 0021 — Risposta del venditore alle recensioni (una sola risposta, modificabile; vuota = la toglie)
alter table public.reviews add column if not exists reply text check (reply is null or length(btrim(reply)) between 1 and 500);
alter table public.reviews add column if not exists replied_at timestamptz;

create or replace function public.reply_to_review(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; txt text := nullif(btrim(coalesce(p_body, '')), '');
begin
  select id, seller_id, author_id, reply into r from reviews where id = p_id;
  if not found or r.seller_id <> auth.uid() then raise exception 'not_found'; end if;
  if txt is not null and length(txt) > 500 then raise exception 'too_long'; end if;
  update reviews set reply = txt, replied_at = case when txt is null then null else now() end where id = p_id;
  if txt is not null and r.reply is null then
    perform notif_push(r.author_id, 'review_reply', 'profiles', r.seller_id, jsonb_build_object('name', notif_name(r.seller_id), 'snippet', left(txt, 80), 'handle', (select handle from profiles where id = r.seller_id)));
  end if;
end $$;
revoke execute on function public.reply_to_review(uuid, text) from public, anon;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
