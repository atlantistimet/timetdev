-- Modelli di prezzo dei servizi "slot":
--   pricing = 'slot'  → blocchi di durata fissa (duration_min) a prezzo fisso (price_cents); il cliente può prenderne fino a max_consecutive di fila
--   pricing = 'timed' → a tempo: duration_min = durata minima, max_duration_min = durata massima, price_cents = prezzo all'ora
alter table services add column if not exists pricing text not null default 'slot';
alter table services add column if not exists max_consecutive smallint not null default 1;
alter table services add column if not exists max_duration_min integer;

alter table services drop constraint if exists services_pricing_check;
alter table services add constraint services_pricing_check check (pricing in ('slot', 'timed'));
alter table services drop constraint if exists services_max_consecutive_check;
alter table services add constraint services_max_consecutive_check check (max_consecutive between 1 and 8 and (max_consecutive = 1 or kind = 'slot'));
alter table services drop constraint if exists services_max_duration_check;
alter table services add constraint services_max_duration_check check (max_duration_min is null or max_duration_min between 5 and 480);
alter table services drop constraint if exists services_timed_check;
alter table services add constraint services_timed_check check (pricing = 'slot' or (kind = 'slot' and not link_only and max_duration_min is not null and max_duration_min >= duration_min));
