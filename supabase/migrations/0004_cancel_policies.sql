-- =====================================================================
-- 0004 — Policy di cancellazione decise dal venditore
-- Sostituisce le tre policy fisse (flessibile/moderata/rigida) con policy a fasce:
--  ogni fascia dice "se si annulla con almeno N ore di anticipo, si rimborsa il X%".
--  Vale la fascia con il più alto N non superiore all'anticipo reale. Serve sempre una fascia a 0 ore.
--  Standard: 48 h → 100%, 2 h → 50%, 0 h (o assenza) → 0%.
-- Il venditore può avere più policy, una predefinita, e assegnarne una a ogni offerta.
-- La prenotazione ne congela una copia (cancel_tiers): cambiare la policy dopo non tocca le prenotazioni già fatte.
-- Se un venditore non ha ancora policy proprie vale quella standard (nel codice del server).
-- =====================================================================

-- ---------- 1. Validazione delle fasce ----------
create or replace function valid_cancel_tiers(t jsonb) returns boolean language plpgsql immutable as $$
declare
  rec record;
  prev_hours int := null;
  prev_pct   int := null;
begin
  if jsonb_typeof(t) <> 'array' or jsonb_array_length(t) not between 1 and 8 then return false; end if;
  for rec in
    select (e->>'hours_before') as h, (e->>'refund_pct') as p, jsonb_typeof(e->'hours_before') as th, jsonb_typeof(e->'refund_pct') as tp
    from jsonb_array_elements(t) e
  loop
    if rec.th <> 'number' or rec.tp <> 'number' then return false; end if;
    if rec.h::numeric <> trunc(rec.h::numeric) or rec.p::numeric <> trunc(rec.p::numeric) then return false; end if;
    if rec.h::int < 0 or rec.h::int > 720 or rec.p::int < 0 or rec.p::int > 100 then return false; end if;
  end loop;
  -- ore uniche, fascia a 0 presente, rimborso che non cresce al diminuire dell'anticipo
  for rec in
    select (e->>'hours_before')::int as h, (e->>'refund_pct')::int as p
    from jsonb_array_elements(t) e order by (e->>'hours_before')::int desc
  loop
    if prev_hours is not null then
      if rec.h = prev_hours then return false; end if;
      if rec.p > prev_pct then return false; end if;
    end if;
    prev_hours := rec.h; prev_pct := rec.p;
  end loop;
  return prev_hours = 0;   -- l'ultima (la più piccola) deve essere 0
end $$;

-- ---------- 2. Policy dei venditori ----------
create table cancel_policies (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references profiles(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  tiers      jsonb not null check (valid_cancel_tiers(tiers)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cancel_policies_one_default on cancel_policies(seller_id) where is_default;
create index cancel_policies_seller on cancel_policies(seller_id);
create trigger cancel_policies_updated before update on cancel_policies
  for each row execute function set_updated_at();

alter table cancel_policies enable row level security;
-- i clienti devono poter leggere la policy prima di prenotare
create policy cancel_policies_read  on cancel_policies for select using (true);
create policy cancel_policies_write on cancel_policies for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- ---------- 3. Offerte e prenotazioni ----------
alter table offers add column cancel_policy_id uuid references cancel_policies(id) on delete set null;  -- null = predefinita del venditore

alter table bookings
  add column cancel_tiers jsonb not null default '[{"hours_before":48,"refund_pct":100},{"hours_before":2,"refund_pct":50},{"hours_before":0,"refund_pct":0}]'
    check (valid_cancel_tiers(cancel_tiers));
comment on column bookings.cancel_tiers is 'Copia delle fasce di rimborso al momento della prenotazione.';

-- ---------- 4. Via le tre policy fisse ----------
alter table bookings drop column cancel_policy;
alter table profiles drop column cancel_policy;
drop type cancel_policy;
