-- =====================================================================
-- 0009 — Luoghi dei servizi
-- Un servizio si può offrire online, nel luogo del venditore (sede) o a domicilio del cliente.
-- Costo aggiuntivo: per la sede è del servizio (affitto spazio), per il domicilio è la trasferta del profilo.
-- =====================================================================
alter table services add column space_fee_cents integer not null default 0 check (space_fee_cents >= 0 and space_fee_cents <= 100000);
alter table services add constraint services_places_not_empty check (cardinality(places) >= 1);
alter table services add constraint services_includes_limit check (cardinality(includes) <= 8);
alter table profiles add constraint profiles_travel_fee_limit check (travel_fee_cents <= 100000);
