-- =====================================================================
-- 0017 — Disponibilità settimanale a periodo (sostituisce il calendario orario della 0008)
--  - Una disponibilità generale per venditore: periodo "dal–al" + sette giorni (lun=1 … dom=7), da 0 a 5 fasce al giorno
--    (un giorno senza fasce è chiuso), minuti multipli di 15, fasce attaccate valgono come una continua.
--  - Disponibilità specifica per un servizio o per un'offerta. Ordine di risoluzione: offerta → servizio → generale.
--  - Giorni chiusi (ferie, festivi): valgono per tutte le disponibilità.
--  - Fuso Europe/Rome: le fasce sono ore locali, il cambio dell'ora è gestito dal database.
--  - Una prenotazione è valida solo se sta tutta in una finestra continua della disponibilità risolta, in un giorno non
--    chiuso e non occupato (`schedule_covers`). Il vincolo di esclusione su bookings e `seller_busy` restano come sono.
--  - "Invia slot", chiamate e "Disponibile ora" non cambiano.
--  - `availability_slots` resta leggibile ma non più scrivibile; si elimina con una migrazione successiva.
-- =====================================================================

create table availability_schedules (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references profiles(id) on delete cascade,
  scope      text not null check (scope in ('general','service','offer')),
  service_id uuid references services(id) on delete cascade,
  offer_id   uuid references offers(id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,                       -- compreso
  timezone   text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check ((scope = 'general' and service_id is null and offer_id is null)
      or (scope = 'service' and service_id is not null and offer_id is null)
      or (scope = 'offer'   and offer_id   is not null and service_id is null))
);
create unique index availability_one_general on availability_schedules (seller_id) where scope = 'general';
create unique index availability_one_service on availability_schedules (service_id) where scope = 'service';
create unique index availability_one_offer   on availability_schedules (offer_id)   where scope = 'offer';
create index availability_schedules_seller on availability_schedules (seller_id);
create trigger availability_schedules_updated before update on availability_schedules for each row execute function set_updated_at();

create table availability_ranges (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references availability_schedules(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- 1 = lunedì … 7 = domenica
  start_time  time not null,
  end_time    time not null,                                       -- 24:00 = mezzanotte di fine giornata
  check (end_time > start_time)
);
create index availability_ranges_schedule on availability_ranges (schedule_id, weekday, start_time);

create table seller_closed_days (
  seller_id uuid not null references profiles(id) on delete cascade,
  day       date not null,
  note      text check (note is null or length(note) <= 120),
  primary key (seller_id, day)
);

-- ---------- Regole sui dati (valgono anche scrivendo direttamente dal client) ----------
create function check_schedule_scope() returns trigger language plpgsql as $$
begin
  if new.scope = 'service' and not exists (select 1 from services s where s.id = new.service_id and s.seller_id = new.seller_id) then
    raise exception 'availability: service_not_owned' using errcode = '23514';
  end if;
  if new.scope = 'offer' and not exists (select 1 from offers o where o.id = new.offer_id and o.seller_id = new.seller_id) then
    raise exception 'availability: offer_not_owned' using errcode = '23514';
  end if;
  perform now() at time zone new.timezone;   -- fuso sconosciuto = errore
  return new;
end $$;
create trigger availability_schedules_scope before insert or update on availability_schedules
  for each row execute function check_schedule_scope();

create function check_availability_range() returns trigger language plpgsql as $$
begin
  if extract(second from new.start_time) <> 0 or extract(second from new.end_time) <> 0
     or mod(extract(minute from new.start_time)::int, 15) <> 0 or mod(extract(minute from new.end_time)::int, 15) <> 0 then
    raise exception 'availability: step_15' using errcode = '23514', hint = new.weekday::text;
  end if;
  if (select count(*) from availability_ranges r where r.schedule_id = new.schedule_id and r.weekday = new.weekday and r.id <> new.id) >= 5 then
    raise exception 'availability: too_many_ranges' using errcode = '23514', hint = new.weekday::text;
  end if;
  -- le fasce che si toccano (9–12 e 12–15) sono consentite: valgono come una sola
  if exists (select 1 from availability_ranges r where r.schedule_id = new.schedule_id and r.weekday = new.weekday and r.id <> new.id
             and r.start_time < new.end_time and r.end_time > new.start_time) then
    raise exception 'availability: ranges_overlap' using errcode = '23514', hint = new.weekday::text;
  end if;
  return new;
end $$;
create trigger availability_ranges_rules before insert or update on availability_ranges
  for each row execute function check_availability_range();

-- ---------- Sicurezza: lettura pubblica, scrittura solo del venditore ----------
alter table availability_schedules enable row level security;
alter table availability_ranges    enable row level security;
alter table seller_closed_days     enable row level security;
create policy avail_sched_read  on availability_schedules for select using (true);
create policy avail_sched_write on availability_schedules for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy avail_range_read  on availability_ranges for select using (true);
create policy avail_range_write on availability_ranges for all
  using (exists (select 1 from availability_schedules s where s.id = schedule_id and s.seller_id = auth.uid()))
  with check (exists (select 1 from availability_schedules s where s.id = schedule_id and s.seller_id = auth.uid()));
create policy closed_read  on seller_closed_days for select using (true);
create policy closed_write on seller_closed_days for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- il vecchio calendario resta leggibile ma non si scrive più
drop policy avail_write on availability_slots;

-- ---------- Salvataggio in un colpo solo ----------
-- p_ranges: [{"weekday":1,"start":"09:00","end":"12:00"}, ...]. Crea o aggiorna la disponibilità e sostituisce le fasce.
create function save_availability(p_scope text, p_service uuid, p_offer uuid, p_starts date, p_ends date, p_ranges jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_seller uuid := auth.uid();
  v_id uuid;
  r jsonb;
begin
  if v_seller is null then raise exception 'availability: not_authenticated' using errcode = '42501'; end if;
  select id into v_id from availability_schedules
   where seller_id = v_seller and scope = p_scope
     and service_id is not distinct from p_service and offer_id is not distinct from p_offer;
  if v_id is null then
    insert into availability_schedules (seller_id, scope, service_id, offer_id, starts_on, ends_on)
    values (v_seller, p_scope, p_service, p_offer, p_starts, p_ends) returning id into v_id;
  else
    update availability_schedules set starts_on = p_starts, ends_on = p_ends where id = v_id;
    delete from availability_ranges where schedule_id = v_id;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_ranges, '[]'::jsonb)) loop
    insert into availability_ranges (schedule_id, weekday, start_time, end_time)
    values (v_id, (r->>'weekday')::smallint, (r->>'start')::time, (r->>'end')::time);
  end loop;
  return v_id;
end $$;
revoke all on function save_availability(text, uuid, uuid, date, date, jsonb) from public, anon;
grant execute on function save_availability(text, uuid, uuid, date, date, jsonb) to authenticated;

-- ---------- Finestre prenotabili ----------
-- Espande la disponibilità risolta (offerta → servizio → generale) in finestre concrete tra p_from e p_to.
-- Toglie i giorni chiusi e, se richiesto, le prenotazioni confermate del venditore; le finestre attaccate si fondono.
create function schedule_windows(p_seller uuid, p_service uuid, p_offer uuid, p_from timestamptz, p_to timestamptz, p_subtract_busy boolean)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sched availability_schedules%rowtype;
  v_all tstzmultirange;
begin
  if p_offer is not null then
    select * into v_sched from availability_schedules where scope = 'offer' and offer_id = p_offer and seller_id = p_seller;
  end if;
  if v_sched.id is null and p_service is not null then
    select * into v_sched from availability_schedules where scope = 'service' and service_id = p_service and seller_id = p_seller;
  end if;
  if v_sched.id is null then
    select * into v_sched from availability_schedules where scope = 'general' and seller_id = p_seller;
  end if;
  if v_sched.id is null then return; end if;

  select range_agg(tstzrange(w.s, w.e, '[)')) into v_all
  from (
    select ((d.day + r.start_time) at time zone v_sched.timezone) as s,
           ((d.day + r.end_time)   at time zone v_sched.timezone) as e
    from (
      select g::date as day
      from generate_series(
        greatest(v_sched.starts_on, (p_from at time zone v_sched.timezone)::date)::timestamp,
        least(v_sched.ends_on,      (p_to   at time zone v_sched.timezone)::date)::timestamp,
        interval '1 day') g
    ) d
    join availability_ranges r on r.schedule_id = v_sched.id and r.weekday = extract(isodow from d.day)::int
    where not exists (select 1 from seller_closed_days c where c.seller_id = p_seller and c.day = d.day)
  ) w;
  if v_all is null then return; end if;

  if p_subtract_busy then
    v_all := v_all - coalesce((
      select range_agg(tstzrange(b.starts_at, b.ends_at, '[)')) from bookings b
      where b.seller_id = p_seller and b.status = 'confirmed' and b.starts_at < p_to and b.ends_at > p_from), '{}'::tstzmultirange);
  end if;
  v_all := v_all * tstzmultirange(tstzrange(p_from, p_to, '[)'));

  return query select lower(x), upper(x) from unnest(v_all) x order by 1;
end $$;
revoke all on function schedule_windows(uuid, uuid, uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function schedule_windows(uuid, uuid, uuid, timestamptz, timestamptz, boolean) to service_role;

-- API per le schermate di prenotazione: finestre libere (con l'occupato già tolto).
create function available_windows(p_seller uuid, p_service uuid, p_offer uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from schedule_windows(p_seller, p_service, p_offer, p_from, least(p_to, p_from + interval '120 days'), true)
$$;
revoke all on function available_windows(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function available_windows(uuid, uuid, uuid, timestamptz, timestamptz) to authenticated, service_role;

-- Controllo per le edge function: l'intervallo [p_start, p_end] sta tutto in una finestra continua?
create function schedule_covers(p_seller uuid, p_service uuid, p_offer uuid, p_start timestamptz, p_end timestamptz, p_subtract_busy boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schedule_windows(p_seller, p_service, p_offer, p_start - interval '1 day', p_end + interval '1 day', p_subtract_busy) w
    where w.starts_at <= p_start and w.ends_at >= p_end)
$$;
revoke all on function schedule_covers(uuid, uuid, uuid, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function schedule_covers(uuid, uuid, uuid, timestamptz, timestamptz, boolean) to service_role;

-- Quante prenotazioni future (non da link) del venditore stanno fuori dalla disponibilità attuale.
create function bookings_outside_schedule(p_seller uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from bookings b
  where auth.uid() = p_seller and b.seller_id = p_seller and b.status = 'confirmed' and b.starts_at > now() and b.source = 'app'
    and not schedule_covers(p_seller, b.service_id, b.offer_id, b.starts_at, b.ends_at, false)
$$;
revoke all on function bookings_outside_schedule(uuid) from public, anon;
grant execute on function bookings_outside_schedule(uuid) to authenticated;

-- ---------- Migrazione dei dati ----------
-- 1. Disponibilità generale per ogni venditore con servizi o ore aperte: oggi + 3 mesi (fine mese se il giorno non esiste),
--    fasce ricavate dagli orari aperti futuri della 0008 (ore consecutive → una fascia, al massimo 5 al giorno).
insert into availability_schedules (seller_id, scope, starts_on, ends_on)
select p.id, 'general', (now() at time zone 'Europe/Rome')::date, ((now() at time zone 'Europe/Rome')::date + interval '3 months')::date
from profiles p
where exists (select 1 from services s where s.seller_id = p.id) or exists (select 1 from availability_slots a where a.seller_id = p.id);

with hrs as (
  select distinct seller_id,
         extract(isodow from (starts_at at time zone 'Europe/Rome'))::int as wd,
         extract(hour   from (starts_at at time zone 'Europe/Rome'))::int as h
  from availability_slots where status = 'open' and starts_at > now()
), isl as (
  select *, h - row_number() over (partition by seller_id, wd order by h) as grp from hrs
), rng as (
  select seller_id, wd, min(h) as a, max(h) + 1 as b, row_number() over (partition by seller_id, wd order by min(h)) as n
  from isl group by seller_id, wd, grp
)
insert into availability_ranges (schedule_id, weekday, start_time, end_time)
select s.id, rng.wd, make_time(rng.a, 0, 0), case when rng.b >= 24 then time '24:00' else make_time(rng.b, 0, 0) end
from rng join availability_schedules s on s.seller_id = rng.seller_id and s.scope = 'general'
where rng.n <= 5;

-- 2. Offerte con periodo / giorni della settimana / fasce orarie → disponibilità specifica dell'offerta.
--    Il vecchio significato era "restringi l'orario del venditore": si parte dalle fasce della generale e si applicano
--    le condizioni (intersezione). Restano nella validità solo le date singole ("giorni"), che continuano a restringere.
do $$
declare
  o record;
  g availability_schedules%rowtype;
  v jsonb;
  s date; e date;
  wdays int[];
  sid uuid;
  rr record;
  orari jsonb;
  today date := (now() at time zone 'Europe/Rome')::date;
begin
  for o in select id, seller_id, validity from offers where validity->'modes' ?| array['periodo','settimana','orari'] loop
    begin
      v := o.validity;
      select * into g from availability_schedules where seller_id = o.seller_id and scope = 'general';
      if g.id is null then continue; end if;
      s := coalesce(nullif(v->>'from','')::date, today);
      e := coalesce(nullif(v->>'to','')::date, greatest(s, today) + interval '3 months');
      if e < s then e := s; end if;
      wdays := case when v->'modes' ? 'settimana'
                    then array(select case when x::int = 0 then 7 else x::int end from jsonb_array_elements_text(v->'wdays') x)
                    else array[1,2,3,4,5,6,7] end;
      orari := case when v->'modes' ? 'orari' then v->'ranges' else null end;
      insert into availability_schedules (seller_id, scope, offer_id, starts_on, ends_on) values (o.seller_id, 'offer', o.id, s, e) returning id into sid;
      for rr in
        select r.weekday, r.start_time as a, r.end_time as b from availability_ranges r where r.schedule_id = g.id and r.weekday = any(wdays) order by r.weekday, r.start_time
      loop
        if orari is null then
          insert into availability_ranges (schedule_id, weekday, start_time, end_time) values (sid, rr.weekday, rr.a, rr.b);
        else
          insert into availability_ranges (schedule_id, weekday, start_time, end_time)
          select sid, rr.weekday, x.a, x.b
          from (
            select greatest(rr.a, make_interval(mins => (ceil(t.f_min / 15.0) * 15)::int)::time) as a,
                   least(rr.b, make_interval(mins => (floor(t.t_min / 15.0) * 15)::int)::time) as b
            from (select extract(hour from (q->>'from')::time) * 60 + extract(minute from (q->>'from')::time) as f_min,
                         extract(hour from (q->>'to')::time) * 60 + extract(minute from (q->>'to')::time) as t_min
                  from jsonb_array_elements(orari) q) t
          ) x where x.a < x.b;
        end if;
      end loop;
      update offers set validity = jsonb_build_object('modes', coalesce((select jsonb_agg(m) from jsonb_array_elements_text(v->'modes') m where m = 'giorni'), '[]'::jsonb), 'days', coalesce(v->'days', '[]'::jsonb))
        where id = o.id;
    exception when others then
      raise notice 'offerta % non migrata: %', o.id, sqlerrm;
    end;
  end loop;
end $$;
