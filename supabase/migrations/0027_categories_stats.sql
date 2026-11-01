-- =====================================================================
-- 0027 — Stile E, fase 1: categorie con emoji e sottocategorie, amministratore, statistiche del profilo
--  - profiles.is_admin: solo il server può cambiarlo (come is_pro / is_verified)
--  - categories: emoji (chiave della libreria Fluent nell'app), parent_key (sottocategorie), active; l'amministratore
--    può creare, modificare e disattivare categorie; 16 categorie esistenti con emoji, nuove categorie e sottocategorie di Lingue
--  - seller_stats(): voto medio, recensioni, ore condivise, sessioni, ultimi 3 recensori; service_ratings(): voto per servizio
-- =====================================================================

-- ---------- Amministratore ----------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function protect_profile_fields() returns trigger language plpgsql as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin') then  -- solo il server può cambiarli
    new.is_pro := old.is_pro; new.is_verified := old.is_verified; new.is_admin := old.is_admin;
  end if;
  return new;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- Categorie ----------
alter table public.categories
  add column if not exists emoji      text,
  add column if not exists parent_key text references public.categories(key) on delete cascade,
  add column if not exists active     boolean not null default true;
alter table public.categories add constraint categories_no_self_parent check (parent_key is null or parent_key <> key);
alter table public.categories add constraint categories_key_format check (key ~ '^[a-z0-9_]{2,40}$');
create index if not exists categories_parent on public.categories(parent_key);

create policy categories_admin_insert on public.categories for insert to authenticated with check (public.is_admin());
create policy categories_admin_update on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin_delete on public.categories for delete to authenticated using (public.is_admin());

-- Un livello solo: una sottocategoria non può avere figli
create or replace function public.check_category_depth() returns trigger language plpgsql as $$
begin
  if new.parent_key is not null and exists (select 1 from categories c where c.key = new.parent_key and c.parent_key is not null) then
    raise exception 'category_depth' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger categories_depth before insert or update on public.categories
  for each row execute function public.check_category_depth();

-- Emoji delle 16 categorie esistenti
update public.categories c set emoji = v.emoji
from (values
  ('design','artist_palette'), ('fisco','money_bag'), ('carriera','briefcase'), ('tech','laptop'),
  ('musica','guitar'), ('bellezza','lipstick'), ('foto','camera'), ('benessere','lotus'),
  ('lingue','speaking_head'), ('legale','balance_scale'), ('marketing','megaphone'), ('cucina','spaghetti'),
  ('fitness','flexed_biceps'), ('casa','hammer_and_wrench'), ('viaggi','airplane'), ('animali','dog_face')
) as v(key, emoji) where c.key = v.key;

-- Nuove categorie (le altre si creano da amministratore)
insert into public.categories (key, names, sort_order, emoji) values
  ('istruzione','{"it":"Istruzione e ripetizioni","en":"Education and tutoring"}',17,'books'),
  ('scrittura','{"it":"Scrittura","en":"Writing"}',18,'pencil'),
  ('consulenza','{"it":"Consulenza e idee","en":"Consulting and ideas"}',19,'light_bulb'),
  ('eventi','{"it":"Eventi e feste","en":"Events and parties"}',20,'party_popper'),
  ('coaching','{"it":"Coaching e relazioni","en":"Coaching and relationships"}',21,'heart_hands'),
  ('audio','{"it":"Audio e podcast","en":"Audio and podcasts"}',22,'headphone')
on conflict (key) do nothing;

-- Sottocategorie di Lingue
insert into public.categories (key, names, sort_order, parent_key) values
  ('lingue_inglese','{"it":"Inglese","en":"English"}',1,'lingue'),
  ('lingue_spagnolo','{"it":"Spagnolo","en":"Spanish"}',2,'lingue'),
  ('lingue_tedesco','{"it":"Tedesco","en":"German"}',3,'lingue'),
  ('lingue_francese','{"it":"Francese","en":"French"}',4,'lingue'),
  ('lingue_italiano','{"it":"Italiano per stranieri","en":"Italian for foreigners"}',5,'lingue')
on conflict (key) do nothing;

-- ---------- Statistiche del profilo e dei servizi ----------
-- Voto medio, recensioni, ore condivise (sessioni svolte + minuti di chiamata), sessioni, ultimi 3 recensori.
create or replace function public.seller_stats(p_ids uuid[])
returns table (seller_id uuid, rating_avg numeric, reviews_count integer, hours_shared numeric, sessions_count integer, reviewers_count integer, reviewers jsonb)
language sql stable security definer set search_path = public as $$
  select p.id,
    coalesce((select round(avg(r.rating)::numeric, 1) from reviews r where r.seller_id = p.id), 0),
    coalesce((select count(*)::int from reviews r where r.seller_id = p.id), 0),
    round((
      coalesce((select sum(extract(epoch from (b.ends_at - b.starts_at))) from bookings b where b.seller_id = p.id and b.status = 'completed'), 0)
      + coalesce((select sum(c.billed_minutes) * 60 from calls c where c.seller_id = p.id and c.status = 'ended'), 0)
    ) / 3600.0, 1),
    coalesce((select count(*)::int from bookings b where b.seller_id = p.id and b.status = 'completed'), 0)
      + coalesce((select count(*)::int from calls c where c.seller_id = p.id and c.status = 'ended' and c.billed_minutes > 0), 0),
    coalesce((select count(distinct r.author_id)::int from reviews r where r.seller_id = p.id), 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'full_name', a.full_name, 'avatar_path', a.avatar_path) order by x.last_at desc)
        from (
          select r.author_id, max(r.created_at) as last_at
            from reviews r where r.seller_id = p.id
           group by r.author_id order by max(r.created_at) desc limit 3
        ) x join profiles a on a.id = x.author_id
    ), '[]'::jsonb)
  from profiles p where p.id = any(p_ids);
$$;
revoke execute on function public.seller_stats(uuid[]) from public, anon;
grant execute on function public.seller_stats(uuid[]) to authenticated;

-- Voto medio per servizio (le recensioni sono legate alla prenotazione, che sa il servizio)
create or replace function public.service_ratings(p_ids uuid[])
returns table (service_id uuid, rating_avg numeric, reviews_count integer)
language sql stable security definer set search_path = public as $$
  select b.service_id, round(avg(r.rating)::numeric, 1), count(*)::int
    from reviews r join bookings b on b.id = r.booking_id
   where b.service_id = any(p_ids)
   group by b.service_id;
$$;
revoke execute on function public.service_ratings(uuid[]) from public, anon;
grant execute on function public.service_ratings(uuid[]) to authenticated;
