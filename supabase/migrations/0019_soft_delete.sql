-- =====================================================================
-- 0019 — Eliminazione di servizi, offerte e link "Invia slot" (senza perdere le prenotazioni)
--  - Non si cancella la riga: si segna deleted_at. L'elemento sparisce dagli elenchi del venditore, non è più visibile né prenotabile,
--    ma le prenotazioni già fatte restano valide e identiche. Il venditore li ritrova in "passati".
--  - Eliminare un servizio elimina anche le sue offerte e i suoi link; i post che li pubblicano escono dal feed.
-- =====================================================================
alter table public.services   add column if not exists deleted_at timestamptz;
alter table public.offers     add column if not exists deleted_at timestamptz;
alter table public.slot_links add column if not exists deleted_at timestamptz;

-- Chi ha una prenotazione continua a leggere il servizio (titolo, descrizione) anche dopo che il venditore lo ha eliminato.
create or replace function public.has_booking_for_service(p_service uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings b where b.service_id = p_service and b.client_id = auth.uid());
$$;
revoke execute on function public.has_booking_for_service(uuid) from public, anon;
grant execute on function public.has_booking_for_service(uuid) to authenticated;

drop policy if exists services_read on public.services;
create policy services_read on public.services for select
  using ((active and deleted_at is null) or seller_id = auth.uid() or public.has_booking_for_service(id));

drop policy if exists offers_read on public.offers;
create policy offers_read on public.offers for select using ((active and deleted_at is null) or seller_id = auth.uid());

-- I link eliminati non si aprono più
create or replace function public.slot_link_by_code(p_code text) returns setof slot_links
language sql stable security definer set search_path = public as $$
  select * from slot_links where code = p_code and deleted_at is null and (expires_at is null or expires_at > now());
$$;
revoke execute on function public.slot_link_by_code(text) from public, anon;
grant execute on function public.slot_link_by_code(text) to authenticated;

create or replace function public.delete_slot_link(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update slot_links set deleted_at = now() where id = p_id and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  update posts set deleted_at = now() where slot_link_id = p_id and deleted_at is null;
end $$;

create or replace function public.delete_offer(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update offers set deleted_at = now(), active = false where id = p_id and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  update posts set deleted_at = now() where offer_id = p_id and deleted_at is null;
end $$;

create or replace function public.delete_service(p_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update services set deleted_at = now(), active = false where id = p_id and seller_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  update offers set deleted_at = now(), active = false where service_id = p_id and deleted_at is null;
  update slot_links set deleted_at = now() where service_id = p_id and deleted_at is null;
  update posts set deleted_at = now()
   where deleted_at is null and (service_id = p_id
      or offer_id in (select id from offers where service_id = p_id)
      or slot_link_id in (select id from slot_links where service_id = p_id));
end $$;

revoke execute on function public.delete_slot_link(uuid), public.delete_offer(uuid), public.delete_service(uuid) from public, anon;
grant execute on function public.delete_slot_link(uuid), public.delete_offer(uuid), public.delete_service(uuid) to authenticated;
