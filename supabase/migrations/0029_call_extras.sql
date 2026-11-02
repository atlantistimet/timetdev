-- =====================================================================
-- 0029 — Chiamate: blocco di durata scelta, minuti aggiunti dal cliente, recensione e mancia
--  1. Il cliente sceglie quanti minuti bloccare (da 5 a 60, a passi di 5). Ogni blocco ricorda i suoi minuti
--     (payments.call_minutes): il primo è quello scelto, i successivi quelli aggiunti con «Aggiungi minuti».
--  2. Niente più rinnovo automatico: allo scadere dei minuti bloccati la chiamata si chiude.
--  3. Recensioni e mance si possono collegare a una chiamata conclusa (oltre che a una prenotazione).
--     La recensione può avere un «umore» (top, idee, bello, carica).
-- =====================================================================

-- ---------- 1. Blocchi di durata variabile ----------
alter table calls add column block_minutes smallint not null default 15 check (block_minutes between 5 and 60 and block_minutes % 5 = 0);
comment on column calls.block_minutes is 'Minuti del primo blocco scelto dal cliente all''avvio (5–60). I blocchi aggiunti dopo hanno i minuti in payments.call_minutes.';

alter table calls drop constraint if exists calls_blocks_held_check;
alter table calls add constraint calls_blocks_held_check check (blocks_held between 0 and 12);

alter table payments add column call_minutes smallint check (call_minutes between 5 and 60);
alter table payments drop constraint if exists payments_call_block_check;
alter table payments add constraint payments_call_block_check check (call_block between 0 and 11);
-- le chiamate già fatte avevano blocchi da 15 minuti
update payments set call_minutes = 15 where call_id is not null and call_minutes is null;

-- ---------- 2. Recensioni anche per le chiamate ----------
alter table reviews alter column booking_id drop not null;
alter table reviews add column call_id uuid unique references calls(id) on delete cascade;
alter table reviews add constraint reviews_one_target check (num_nonnulls(booking_id, call_id) = 1);
alter table reviews add column mood text check (mood in ('top', 'idee', 'bello', 'carica'));

drop policy if exists reviews_insert on reviews;
create policy reviews_insert on reviews for insert with check (
  author_id = auth.uid() and (
    exists (select 1 from bookings b where b.id = reviews.booking_id and b.client_id = auth.uid()
              and b.seller_id = reviews.seller_id and b.status = 'completed')
    or exists (select 1 from calls c where c.id = reviews.call_id and c.client_id = auth.uid()
              and c.seller_id = reviews.seller_id and c.status = 'ended' and c.billed_minutes > 0)));

-- la notifica «nuova recensione» rimanda alla prenotazione o alla chiamata
create or replace function public.notify_review() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notif_push(new.seller_id, 'review', case when new.call_id is not null then 'calls' else 'bookings' end,
    coalesce(new.call_id, new.booking_id), jsonb_build_object('name', notif_name(new.author_id), 'rating', new.rating));
  return new;
end $$;

-- voto medio per servizio: prenotazioni e chiamate insieme
create or replace function public.service_ratings(p_ids uuid[])
returns table (service_id uuid, rating_avg numeric, reviews_count integer)
language sql stable security definer set search_path = public as $$
  select x.service_id, round(avg(x.rating)::numeric, 1), count(*)::int
    from (
      select b.service_id, r.rating from reviews r join bookings b on b.id = r.booking_id
      union all
      select c.service_id, r.rating from reviews r join calls c on c.id = r.call_id
    ) x
   where x.service_id = any(p_ids)
   group by x.service_id;
$$;
revoke execute on function public.service_ratings(uuid[]) from public, anon;
grant execute on function public.service_ratings(uuid[]) to authenticated;

-- ---------- 3. Mance anche per le chiamate ----------
alter table payments add column tip_call_id uuid references calls(id);
create index payments_tip_call on payments(tip_call_id) where tip_call_id is not null;
alter table payments drop constraint payments_one_target;
alter table payments add constraint payments_one_target check (num_nonnulls(booking_id, package_id, call_id, tip_booking_id, tip_call_id) = 1);

create or replace function public.notify_payment() returns trigger language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if new.status <> 'captured' or old.status = 'captured' then return new; end if;
  if new.booking_id is not null then
    select service_title, starts_at into b from bookings where id = new.booking_id;
    perform notif_push(new.seller_id, 'booking_new', 'bookings', new.booking_id,
      jsonb_build_object('name', notif_name(new.payer_id), 'title', b.service_title, 'starts_at', b.starts_at));
  elsif new.package_id is not null then
    select service_title into b from bookings where package_id = new.package_id limit 1;
    perform notif_push(new.seller_id, 'package_new', null, null, jsonb_build_object('name', notif_name(new.payer_id), 'title', b.service_title));
  elsif new.tip_booking_id is not null then
    perform notif_push(new.seller_id, 'tip', 'bookings', new.tip_booking_id, jsonb_build_object('name', notif_name(new.payer_id), 'amount_cents', new.amount_cents));
  elsif new.tip_call_id is not null then
    perform notif_push(new.seller_id, 'tip', 'calls', new.tip_call_id, jsonb_build_object('name', notif_name(new.payer_id), 'amount_cents', new.amount_cents));
  end if;
  return new;
end $$;
