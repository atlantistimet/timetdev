-- =====================================================================
-- 0007 — Offerte come nel prototipo
-- Un'offerta è una variante di un servizio con prezzo/durata/sconto e una validità (giorni, periodo, giorni della
-- settimana, fasce orarie), un messaggio e, se vuole, fasce di rimborso proprie (null = quelle del servizio,
-- poi la predefinita del venditore, poi la standard).
-- validity: {"modes":["giorni","periodo","settimana","orari"],"days":["2026-10-20"],"from":"2026-10-20","to":"2026-10-31",
--            "wdays":[1,2],"ranges":[{"from":"09:00","to":"13:00"}]}  — modes vuoto = sempre. Gli orari sono locali (Europe/Rome).
-- =====================================================================
alter table offers add column message text check (message is null or length(message) <= 280);
alter table offers add column cancel_tiers jsonb check (cancel_tiers is null or valid_cancel_tiers(cancel_tiers));
alter table offers drop column if exists cancel_policy_id;   -- sostituita da cancel_tiers
create index offers_service on offers(service_id) where active;

-- il servizio dell'offerta deve essere del venditore
create or replace function check_offer_service_owner() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from services s where s.id = new.service_id and s.seller_id = new.seller_id and s.kind = 'slot') then
    raise exception 'service does not belong to the seller' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger offers_service_owner before insert or update of service_id, seller_id on offers
  for each row execute function check_offer_service_owner();
