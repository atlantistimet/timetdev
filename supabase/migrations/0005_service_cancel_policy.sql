-- =====================================================================
-- 0005 — Policy di cancellazione per servizio
-- Le prenotazioni oggi si fanno sui servizi (non sulle offerte): la policy scelta dal venditore
-- per un servizio vale per le sue prenotazioni. Vuoto = policy predefinita del venditore (poi standard).
-- La colonna offers.cancel_policy_id resta per le offerte con sconto/validità, quando le useremo.
-- =====================================================================
alter table services add column cancel_policy_id uuid references cancel_policies(id) on delete set null;

-- La policy assegnata deve essere del venditore del servizio (le regole di accesso da sole non lo garantiscono).
create or replace function check_service_policy_owner() returns trigger language plpgsql as $$
begin
  if new.cancel_policy_id is not null and not exists (
    select 1 from cancel_policies p where p.id = new.cancel_policy_id and p.seller_id = new.seller_id
  ) then
    raise exception 'cancel policy does not belong to the seller' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger services_policy_owner before insert or update of cancel_policy_id on services
  for each row execute function check_service_policy_owner();
