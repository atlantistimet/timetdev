-- Recensione ricondivisa in un post (solo recensioni ricevute dall'autore) e scelta di chi l'ha scritta: anonimo o pubblico.
alter table posts add column if not exists review_id uuid references reviews(id) on delete set null;
create unique index if not exists posts_review_unique on posts(review_id) where review_id is not null and deleted_at is null;

alter table reviews add column if not exists public_choice text check (public_choice in ('anonymous', 'public'));

create or replace function check_post_review() returns trigger language plpgsql as $$
begin
  if new.review_id is not null and not exists (select 1 from reviews r where r.id = new.review_id and r.seller_id = new.author_id) then
    raise exception 'review does not belong to the author' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists posts_review_check on posts;
create trigger posts_review_check before insert or update of review_id, author_id on posts for each row execute function check_post_review();

-- Chi ha scritto la recensione riceve una notifica la prima volta che viene ricondivisa (finché non ha scelto).
create or replace function notify_review_shared() returns trigger language plpgsql security definer set search_path = public as $$
declare r reviews%rowtype;
begin
  if new.review_id is null then return new; end if;
  select * into r from reviews where id = new.review_id;
  if r.public_choice is null then
    insert into notifications (user_id, kind, ref_table, ref_id, payload)
    values (r.author_id, 'review_shared', 'reviews', r.id,
      jsonb_build_object('name', (select full_name from profiles where id = r.seller_id), 'post_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists posts_review_notify on posts;
create trigger posts_review_notify after insert on posts for each row execute function notify_review_shared();

-- Risposta di chi ha scritto la recensione.
create or replace function answer_review_publicity(p_review uuid, p_public boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  update reviews set public_choice = case when p_public then 'public' else 'anonymous' end
   where id = p_review and author_id = auth.uid();
  if not found then raise exception 'not_allowed' using errcode = '42501'; end if;
  update notifications set read_at = coalesce(read_at, now()) where user_id = auth.uid() and kind = 'review_shared' and ref_id = p_review;
end $$;
grant execute on function answer_review_publicity(uuid, boolean) to authenticated;
