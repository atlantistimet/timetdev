-- =====================================================================
-- 0006 — Le fasce di rimborso si modificano direttamente nella pagina dell'offerta
-- Sostituisce services.cancel_policy_id (0005) con services.cancel_tiers: le fasce proprie dell'offerta.
-- Vuoto (null) = vale la policy predefinita del venditore, altrimenti la standard.
-- Le policy salvate (cancel_policies) restano come modelli da cui partire.
-- =====================================================================
drop trigger if exists services_policy_owner on services;
drop function if exists check_service_policy_owner();
alter table services drop column if exists cancel_policy_id;
alter table services add column cancel_tiers jsonb check (cancel_tiers is null or valid_cancel_tiers(cancel_tiers));
