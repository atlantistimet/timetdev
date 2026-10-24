-- 0015: slot con orario preciso o immediato; richieste di fattura/ricevuta; mance.

-- 1. Link "Invia slot" con un solo orario preciso (anche immediato). Con starts_at il cliente può prenotare solo quell'istante,
--    anche fuori dalle ore aperte del venditore (lo propone lui); le sovrapposizioni con altre prenotazioni le impedisce il database.
alter table slot_links add column starts_at timestamptz;
alter table slot_links add constraint slot_links_exact_one_day check (starts_at is null or cardinality(days) = 1);

-- 2. Richieste di fattura o ricevuta su una prenotazione. Le gestisce il venditore o Timeet: qui si registra solo la richiesta.
create table invoice_requests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  kind         text not null check (kind in ('receipt', 'invoice')),
  details      text check (details is null or length(details) <= 1000),  -- intestazione, partita IVA o codice fiscale, indirizzo
  status       text not null default 'open' check (status in ('open', 'done')),
  created_at   timestamptz not null default now(),
  unique (booking_id, requester_id, kind)
);
alter table invoice_requests enable row level security;
create policy invreq_read on invoice_requests for select
  using (requester_id = auth.uid() or exists (select 1 from bookings b where b.id = booking_id and b.seller_id = auth.uid()));
create policy invreq_insert on invoice_requests for insert
  with check (requester_id = auth.uid() and exists (select 1 from bookings b where b.id = booking_id and b.client_id = auth.uid() and b.status in ('confirmed', 'completed', 'no_show')));

-- 3. Mance: un pagamento a parte collegato alla prenotazione (tip_booking_id). Il vincolo "uno solo fra prenotazione, pacchetto, chiamata" ora include anche la mancia.
alter table payments add column tip_booking_id uuid references bookings(id);
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%num_nonnulls%'
  loop execute format('alter table payments drop constraint %I', c); end loop;
end $$;
alter table payments add constraint payments_one_target check (num_nonnulls(booking_id, package_id, call_id, tip_booking_id) = 1);
create index payments_tip on payments(tip_booking_id) where tip_booking_id is not null;
