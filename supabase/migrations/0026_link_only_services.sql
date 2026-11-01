-- =====================================================================
-- 0026 — Slot personalizzato (ex "Invia slot"): servizi "solo-link"
--  - Un servizio creato apposta per un singolo slot personalizzato (modo B) esiste solo dentro quel link:
--    non compare nel profilo, in Esplora, tra le offerte né in "I miei servizi", e si prenota solo dal link.
--  - Lo legge solo chi ha un link valido (tramite funzione) o chi ha già prenotato; il proprietario lo vede sempre.
--  - Eliminare il link elimina anche il suo servizio solo-link (le prenotazioni già fatte restano).
-- =====================================================================
alter table public.services add column if not exists link_only boolean not null default false;
alter table public.services add constraint services_link_only_slot check (not link_only or kind = 'slot');
create index if not exists services_link_only on public.services(seller_id) where link_only;

-- Lettura: il catalogo pubblico non include i servizi solo-link
drop policy if exists services_read on public.services;
create policy services_read on public.services for select
  using ((active and deleted_at is null and not link_only) or seller_id = auth.uid() or public.has_booking_for_service(id));

-- Il servizio di un link, letto con il codice (per chi riceve il link e non ha ancora prenotato)
create or replace function public.link_service(p_code text) returns setof public.services
language sql stable security definer set search_path = public as $$
  select s.* from slot_links l join services s on s.id = l.service_id
   where l.code = p_code and l.deleted_at is null and (l.expires_at is null or l.expires_at > now())
     and s.deleted_at is null and s.active;
$$;
revoke execute on function public.link_service(text) from public, anon;
grant execute on function public.link_service(text) to authenticated;

-- Un servizio solo-link non può diventare un'offerta
create or replace function check_offer_service_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from services s where s.id = new.service_id and s.seller_id = new.seller_id and s.kind = 'slot' and not s.link_only) then
    raise exception 'service does not belong to the seller' using errcode = '23514';
  end if;
  return new;
end $$;

-- Si prenota un servizio solo-link soltanto passando dal suo link (regola nel database, vale per ogni funzione)
create or replace function public.check_link_only_booking() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.service_id is not null and new.slot_link_id is null
     and exists (select 1 from services s where s.id = new.service_id and s.link_only) then
    raise exception 'link_only_service' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists bookings_link_only on public.bookings;
create trigger bookings_link_only before insert on public.bookings
  for each row execute function public.check_link_only_booking();

-- Eliminare un link elimina il suo servizio solo-link (se nessun altro link lo usa)
create or replace function public.delete_slot_link(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare v_service uuid;
begin
  update slot_links set deleted_at = now() where id = p_id and seller_id = auth.uid() and deleted_at is null
    returning service_id into v_service;
  if not found then raise exception 'not_found'; end if;
  update posts set deleted_at = now() where slot_link_id = p_id and deleted_at is null;
  update services set deleted_at = now(), active = false
   where id = v_service and link_only and seller_id = auth.uid() and deleted_at is null
     and not exists (select 1 from slot_links l where l.service_id = v_service and l.deleted_at is null);
end $$;
revoke execute on function public.delete_slot_link(uuid) from public, anon;
grant execute on function public.delete_slot_link(uuid) to authenticated;
