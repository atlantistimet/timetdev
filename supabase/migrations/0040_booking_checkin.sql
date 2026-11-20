-- =====================================================================
-- 0040 — Check-in con QR per le sessioni in presenza (decisione del 4 novembre 2026)
--  - Vale per le prenotazioni pagate con luogo "sede" (luogo del venditore) o "domicilio": servizi a blocchi, a tempo e pacchetti.
--    Le sessioni online (l'equivalente è l'ingresso nella stanza LiveKit) e le chiamate al minuto restano fuori.
--  - Regola: scansiona chi arriva, mostra chi aspetta. Sede: mostra il venditore, scansiona il cliente.
--    Domicilio: mostra il cliente, scansiona il venditore. Basta una scansione.
--    Chi mostra e chi scansiona lo decidono SOLO checkin_shower / checkin_scanner: con i Team (erogante, reception) si cambia lì.
--  - Il check-in non muove denaro e non crea documenti fiscali (nascono dal pagamento): certifica che la sessione è iniziata.
--  - Stato: resta 'confirmed' con checked_in_at valorizzato (= "in corso"). Un nuovo valore di booking_status libererebbe lo slot
--    durante la sessione (il vincolo anti-sovrapposizione vale solo per 'confirmed') e cambierebbe tutte le query che filtrano su 'confirmed'.
--  - Il token del QR (HMAC-SHA256 a finestre di 60 s) si genera e si verifica nelle edge function booking-checkin-token e booking-checkin,
--    le sole che conoscono il segreto CHECKIN_SECRET. Le funzioni SQL non lo conoscono: per questo checkin_status, checkin_booking e
--    checkin_code_failed sono eseguibili solo dal service role (altrimenti chiunque potrebbe fare il check-in senza QR).
--  - Job booking-checkin-sweep ogni 5 minuti:
--     · con check-in, a fine sessione → 'completed' (senza aspettare le 24 ore né il venditore);
--     · in presenza, pagata, senza check-in 15 minuti dopo l'inizio → 'no_show' (prenota ora: a fine sessione, perché l'inizio
--       coincide con il pagamento e la persona deve ancora arrivare).
--  - Un check-in fatto prima della fine della sessione annulla il no-show automatico (chi arriva in ritardo non resta "assente").
--  - Entro 24 ore dal no-show automatico: il venditore può correggerlo in 'completed' ("il cliente c'era, non ha scansionato"),
--    il cliente può contestarlo (segnalazione entity_type 'booking', motivo 'no_show_dispute'). Poi lo stato è definitivo.
--  - Team (non ancora): niente qui dà per scontato che venditore ed erogante siano la stessa persona, a parte le due funzioni sopra
--    e confirm_attended (oggi la correzione spetta al venditore).
-- =====================================================================

-- 1. Colonne
alter table public.bookings add column if not exists checked_in_at timestamptz;
alter table public.bookings add column if not exists checked_in_by uuid references public.profiles(id);
alter table public.bookings add column if not exists auto_no_show_at timestamptz;
alter table public.bookings add column if not exists checkin_code_failures smallint not null default 0;
alter table public.bookings drop constraint if exists bookings_checkin_pair;
alter table public.bookings add constraint bookings_checkin_pair check ((checked_in_at is null) = (checked_in_by is null));

comment on column public.bookings.checked_in_at is 'Check-in con QR (sessioni in presenza): momento della scansione. Con status confirmed vuol dire "in corso".';
comment on column public.bookings.checked_in_by is 'Chi ha scansionato il QR o digitato il codice.';
comment on column public.bookings.auto_no_show_at is 'Momento in cui il job ha segnato la prenotazione no_show per mancato check-in: da qui partono le 24 ore per correggere o contestare.';
comment on column public.bookings.checkin_code_failures is 'Codici a 6 cifre sbagliati: oltre il limite (edge function booking-checkin) il codice non si accetta più.';

create index if not exists bookings_checkin_sweep on public.bookings (starts_at)
  where status = 'confirmed' and place in ('sede', 'domicilio');

-- 2. Pagata: c'è un pagamento incassato per la prenotazione o per il suo pacchetto (le mance hanno tip_booking_id, non booking_id).
create or replace function public.booking_is_paid(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from bookings b
    join payments p on p.status = 'captured'
                   and (p.booking_id = b.id or (b.package_id is not null and p.package_id = b.package_id))
    where b.id = p_booking
  )
$$;

-- 3. Chi mostra il QR e chi lo scansiona (null per le sessioni online).
create or replace function public.checkin_shower(b public.bookings) returns uuid
language sql stable as $$
  select case b.place when 'sede' then b.seller_id when 'domicilio' then b.client_id end
$$;
create or replace function public.checkin_scanner(b public.bookings) returns uuid
language sql stable as $$
  select case b.place when 'sede' then b.client_id when 'domicilio' then b.seller_id end
$$;

-- 4. Si può mostrare / fare il check-in? p_role: 'show' (chi mostra il QR) o 'scan' (chi lo scansiona).
--    Risposte: ok | not_found | wrong_party | already_checked_in | too_early | too_late
--    not_found copre anche: prenotazione online, annullata o non pagata (a chi non ne fa parte non si dice che esiste).
create or replace function public.checkin_status(p_booking uuid, p_user uuid, p_role text) returns text
language plpgsql stable security definer set search_path = public as $$
declare b bookings;
begin
  if p_role not in ('show', 'scan') then raise exception 'invalid_role'; end if;
  select * into b from bookings where id = p_booking;
  if not found or p_user is null or p_user not in (b.client_id, b.seller_id) then return 'not_found'; end if;
  if b.place not in ('sede', 'domicilio') or b.status = 'cancelled' or not booking_is_paid(b.id) then return 'not_found'; end if;
  if p_user is distinct from (case when p_role = 'show' then checkin_shower(b) else checkin_scanner(b) end) then return 'wrong_party'; end if;
  if b.checked_in_at is not null then return 'already_checked_in'; end if;
  if now() < b.starts_at - interval '15 minutes' then return 'too_early'; end if;
  if now() > b.ends_at then return 'too_late'; end if;
  -- Dentro la finestra: confermata, oppure segnata assente dal job (chi arriva in ritardo può ancora fare il check-in).
  if b.status = 'confirmed' or (b.status = 'no_show' and b.auto_no_show_at is not null) then return 'ok'; end if;
  return 'too_late';
end
$$;

-- 5. Check-in. La chiama solo l'edge function booking-checkin, DOPO aver verificato il token o il codice.
create or replace function public.checkin_booking(p_booking uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  perform 1 from bookings where id = p_booking for update; -- due scansioni insieme: vince la prima
  r := checkin_status(p_booking, p_user, 'scan');
  if r <> 'ok' then return r; end if;
  update bookings
     set status = 'confirmed', auto_no_show_at = null, checked_in_at = now(), checked_in_by = p_user
   where id = p_booking;
  return 'ok';
exception
  -- no-show annullato ma nel frattempo l'orario è stato preso da un'altra prenotazione
  when exclusion_violation then return 'too_late';
end
$$;

-- 6. Codice a 6 cifre sbagliato: conta il tentativo e restituisce il totale.
create or replace function public.checkin_code_failed(p_booking uuid) returns integer
language sql volatile security definer set search_path = public as $$
  update bookings set checkin_code_failures = checkin_code_failures + 1 where id = p_booking returning checkin_code_failures::integer
$$;

-- 7. Job: concludere le sessioni con check-in, segnare assenti quelle in presenza senza check-in.
create or replace function public.checkin_sweep() returns void
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'completed'
   where status = 'confirmed' and checked_in_at is not null and ends_at <= now();

  update bookings b set status = 'no_show', auto_no_show_at = now()
   where b.status = 'confirmed'
     and b.checked_in_at is null
     and b.place in ('sede', 'domicilio')
     and now() >= case when b.instant then b.ends_at else b.starts_at + interval '15 minutes' end
     and booking_is_paid(b.id);
end
$$;

revoke all on function public.booking_is_paid(uuid) from public, anon, authenticated;
revoke all on function public.checkin_status(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.checkin_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.checkin_code_failed(uuid) from public, anon, authenticated;
revoke all on function public.checkin_sweep() from public, anon, authenticated;
grant execute on function public.booking_is_paid(uuid) to service_role;
grant execute on function public.checkin_status(uuid, uuid, text) to service_role;
grant execute on function public.checkin_booking(uuid, uuid) to service_role;
grant execute on function public.checkin_code_failed(uuid) to service_role;

select cron.schedule('booking-checkin-sweep', '*/5 * * * *', 'select public.checkin_sweep()');

-- 8. Notifica del no-show automatico, a venditore e cliente (kind booking_no_show; il testo lo compone l'app da role + payload).
create or replace function public.notify_booking_no_show() returns trigger
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if new.status = 'no_show' and old.status = 'confirmed' and new.auto_no_show_at is not null then
    until := new.auto_no_show_at + interval '24 hours';
    perform notif_push(new.seller_id, 'booking_no_show', 'bookings', new.id,
      jsonb_build_object('role', 'seller', 'name', notif_name(new.client_id), 'title', new.service_title, 'starts_at', new.starts_at, 'until', until));
    perform notif_push(new.client_id, 'booking_no_show', 'bookings', new.id,
      jsonb_build_object('role', 'client', 'name', notif_name(new.seller_id), 'title', new.service_title, 'starts_at', new.starts_at, 'until', until));
  end if;
  return new;
end
$$;
drop trigger if exists bookings_notify_no_show on public.bookings;
create trigger bookings_notify_no_show after update of status on public.bookings
  for each row execute function public.notify_booking_no_show();

-- 9. Il venditore corregge il no-show automatico: "il cliente c'era, non ha scansionato" (entro 24 ore).
create or replace function public.confirm_attended(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking for update;
  if not found or b.seller_id <> auth.uid() then raise exception 'not_found'; end if;
  if b.status <> 'no_show' or b.auto_no_show_at is null then raise exception 'not_correctable'; end if;
  if now() > b.auto_no_show_at + interval '24 hours' then raise exception 'too_late'; end if;
  update bookings set status = 'completed' where id = p_booking;
end
$$;
revoke all on function public.confirm_attended(uuid) from public, anon;
grant execute on function public.confirm_attended(uuid) to authenticated;

-- 10. Il cliente contesta il no-show automatico (entro 24 ore): segnalazione sulla prenotazione.
--     Il trigger vale anche per chi inserisce in reports direttamente (la policy reports_insert lo permette).
create or replace function public.check_no_show_dispute() returns trigger
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if new.reason is distinct from 'no_show_dispute' then return new; end if;
  if new.entity_type <> 'booking' then raise exception 'not_disputable'; end if;
  select * into b from bookings where id = new.entity_id;
  if not found or b.client_id is distinct from new.reporter_id then raise exception 'not_found'; end if;
  if b.status <> 'no_show' or b.auto_no_show_at is null then raise exception 'not_disputable'; end if;
  if now() > b.auto_no_show_at + interval '24 hours' then raise exception 'too_late'; end if;
  if exists (select 1 from reports where entity_type = 'booking' and entity_id = new.entity_id and reason = 'no_show_dispute') then
    raise exception 'already_disputed';
  end if;
  return new;
end
$$;
drop trigger if exists reports_check_no_show_dispute on public.reports;
create trigger reports_check_no_show_dispute before insert on public.reports
  for each row execute function public.check_no_show_dispute();

create or replace function public.dispute_no_show(p_booking uuid, p_details text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_details is not null and char_length(p_details) > 1000 then raise exception 'too_long'; end if;
  insert into reports (reporter_id, entity_type, entity_id, reason, details)
  values (auth.uid(), 'booking', p_booking, 'no_show_dispute', nullif(btrim(coalesce(p_details, '')), ''));
end
$$;
revoke all on function public.dispute_no_show(uuid, text) from public, anon;
grant execute on function public.dispute_no_show(uuid, text) to authenticated;

-- 11. Esito segnato dal venditore (0013): non si può segnare "assente" chi ha fatto il check-in.
create or replace function mark_booking_outcome(p_booking uuid, p_outcome text)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if p_outcome not in ('completed', 'no_show') then raise exception 'invalid_outcome'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found or b.seller_id <> auth.uid() then raise exception 'not_found'; end if;
  if b.status <> 'confirmed' then raise exception 'not_markable'; end if;
  if b.ends_at > now() then raise exception 'not_finished'; end if;
  if p_outcome = 'no_show' and b.checked_in_at is not null then raise exception 'checked_in'; end if;
  update bookings set status = p_outcome::booking_status where id = p_booking;
end
$$;
revoke all on function mark_booking_outcome(uuid, text) from public;
revoke execute on function mark_booking_outcome(uuid, text) from anon;
grant execute on function mark_booking_outcome(uuid, text) to authenticated;
