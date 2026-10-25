-- 0018 — Prenotazione immediata: il venditore è "Disponibile ora", la sessione parte appena il cliente ha pagato.
alter table public.bookings add column if not exists instant boolean not null default false;
comment on column public.bookings.instant is 'Prenotazione immediata: all''incasso starts_at/ends_at si spostano su "adesso" (stessa durata).';
