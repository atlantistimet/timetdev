-- =====================================================================
-- 0020 — Notifiche nell'app
--  Le righe nascono da trigger (security definer): nessun client può inserirne. Ognuno legge e segna come lette solo le proprie (RLS 0001).
--  Tipi: booking_new, package_new, booking_cancelled, tip, message, comment, follow, review, call_missed, availability_expiring (+ tag_request già esistente).
--  Il testo si compone nell'app da kind + payload (it/en).
-- =====================================================================
create or replace function public.notif_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$ select coalesce(full_name, '') from profiles where id = p_id $$;

create or replace function public.notif_push(p_user uuid, p_kind text, p_table text, p_ref uuid, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, ref_table, ref_id, payload) values (p_user, p_kind, p_table, p_ref, coalesce(p_payload, '{}'));
$$;
revoke execute on function public.notif_push(uuid, text, text, uuid, jsonb), public.notif_name(uuid) from public, anon, authenticated;

-- Pagamento incassato: nuova prenotazione / nuovo pacchetto / mancia al venditore
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
  end if;
  return new;
end $$;
drop trigger if exists payments_notify on public.payments;
create trigger payments_notify after update of status on public.payments for each row execute function public.notify_payment();

-- Prenotazione annullata da una delle due parti: avvisa l'altra
create or replace function public.notify_booking_cancelled() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status = 'confirmed' and new.cancelled_by is not null then
    perform notif_push(case when new.cancelled_by = new.client_id then new.seller_id else new.client_id end, 'booking_cancelled', 'bookings', new.id,
      jsonb_build_object('name', notif_name(new.cancelled_by), 'title', new.service_title, 'starts_at', new.starts_at, 'refund_cents', new.refund_cents));
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify_cancel on public.bookings;
create trigger bookings_notify_cancel after update of status on public.bookings for each row execute function public.notify_booking_cancelled();

-- Messaggio: una sola notifica non letta per conversazione, con il conteggio
create or replace function public.notify_message() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; rcpt uuid; n int;
begin
  select user_a, user_b into c from conversations where id = new.conversation_id;
  rcpt := case when new.sender_id = c.user_a then c.user_b else c.user_a end;
  update notifications set created_at = now(), payload = jsonb_build_object('name', notif_name(new.sender_id), 'count', coalesce((payload->>'count')::int, 1) + 1, 'sender_id', new.sender_id)
   where user_id = rcpt and kind = 'message' and ref_id = new.conversation_id and read_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    perform notif_push(rcpt, 'message', 'conversations', new.conversation_id, jsonb_build_object('name', notif_name(new.sender_id), 'count', 1, 'sender_id', new.sender_id));
  end if;
  return new;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.notify_message();

-- Commento a un mio post
create or replace function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select author_id into a from posts where id = new.post_id;
  if a is not null and a <> new.author_id then
    perform notif_push(a, 'comment', 'posts', new.post_id, jsonb_build_object('name', notif_name(new.author_id), 'snippet', left(new.body, 80)));
  end if;
  return new;
end $$;
drop trigger if exists comments_notify on public.post_comments;
create trigger comments_notify after insert on public.post_comments for each row execute function public.notify_comment();

-- Nuovo follower
create or replace function public.notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notif_push(new.followee_id, 'follow', 'profiles', new.follower_id, jsonb_build_object('name', notif_name(new.follower_id), 'handle', (select handle from profiles where id = new.follower_id)));
  return new;
end $$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows for each row execute function public.notify_follow();

-- Nuova recensione
create or replace function public.notify_review() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notif_push(new.seller_id, 'review', 'bookings', new.booking_id, jsonb_build_object('name', notif_name(new.author_id), 'rating', new.rating));
  return new;
end $$;
drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify after insert on public.reviews for each row execute function public.notify_review();

-- Chiamata senza risposta (il venditore non ha risposto entro 60 secondi)
create or replace function public.notify_call_missed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'missed' and old.status <> 'missed' then
    perform notif_push(new.seller_id, 'call_missed', 'calls', new.id, jsonb_build_object('name', notif_name(new.client_id), 'title', new.service_title));
  end if;
  return new;
end $$;
drop trigger if exists calls_notify_missed on public.calls;
create trigger calls_notify_missed after update of status on public.calls for each row execute function public.notify_call_missed();

-- Disponibilità generale in scadenza (entro 14 giorni): una notifica per ogni data di fine
create or replace function public.notify_expiring_availability() returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; s record;
begin
  for s in select a.id, a.seller_id, a.ends_on from availability_schedules a
            where a.scope = 'general' and a.ends_on between (now() at time zone 'Europe/Rome')::date and (now() at time zone 'Europe/Rome')::date + 14
              and not exists (select 1 from notifications x where x.user_id = a.seller_id and x.kind = 'availability_expiring' and x.ref_id = a.id and x.payload->>'ends_on' = a.ends_on::text)
  loop
    perform notif_push(s.seller_id, 'availability_expiring', 'availability_schedules', s.id, jsonb_build_object('ends_on', s.ends_on));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_expiring_availability() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('availability-expiry') from cron.job where jobname = 'availability-expiry';
    perform cron.schedule('availability-expiry', '0 7 * * *', 'select public.notify_expiring_availability()');
  end if;
end $$;

-- Per leggere in fretta le non lette
create index if not exists notifications_unread on public.notifications(user_id, created_at desc) where read_at is null;
