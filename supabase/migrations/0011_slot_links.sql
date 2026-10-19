-- =====================================================================
-- 0011 — "Invia slot": link con orari proposti
-- Il venditore crea un link (giorni, fasce orarie, prezzo, sconto, luoghi, costi extra); chi lo riceve prenota.
-- La lettura per codice è solo per utenti autenticati; il server ricontrolla tutto alla prenotazione.
-- =====================================================================
alter table slot_links add constraint slot_links_days_limit check (cardinality(days) between 1 and 14);
alter table slot_links add constraint slot_links_places_not_empty check (cardinality(places) >= 1);
alter table slot_links add constraint slot_links_extras_limit check (extra_space_cents <= 100000 and extra_travel_cents <= 100000);
alter table slot_links add constraint slot_links_ranges_array check (jsonb_typeof(ranges) = 'array' and jsonb_array_length(ranges) between 1 and 8);
alter table slot_links add constraint slot_links_service_required check (service_id is not null);

create or replace function check_slot_link_service_owner() returns trigger language plpgsql as $$
begin
  if new.service_id is not null and not exists (
    select 1 from services s where s.id = new.service_id and s.seller_id = new.seller_id and s.kind = 'slot'
  ) then
    raise exception 'service does not belong to the seller' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger slot_links_service_owner before insert or update of service_id, seller_id on slot_links
  for each row execute function check_slot_link_service_owner();

revoke execute on function slot_link_by_code(text) from public, anon;
grant execute on function slot_link_by_code(text) to authenticated;
