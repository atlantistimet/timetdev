-- =====================================================================
-- 0016 — Chiamate al minuto
-- La tabella `calls` esiste dalla 0001: qui si aggiungono stato, scadenze, battiti di presenza
-- e campi per servizi futuri (registrazione, trascrizione AI) senza toccare di nuovo lo schema.
-- Denaro: un PaymentIntent a cattura manuale per ogni blocco di 15 minuti (più righe in `payments`,
-- una per blocco, col numero in `call_block`). A fine chiamata si incassano i minuti usati e si
-- annullano i blocchi non usati. Scrive solo il server.
-- =====================================================================

create type call_status as enum (
  'awaiting_payment',  -- creata, il cliente non ha ancora confermato il blocco sulla carta
  'ringing',           -- blocco confermato, il venditore ha 60 secondi per rispondere
  'active',            -- in corso (il conteggio parte quando risponde il venditore)
  'ended',             -- conclusa
  'missed',            -- il venditore non ha risposto in tempo: nessun addebito
  'declined',          -- rifiutata dal venditore: nessun addebito
  'cancelled'          -- annullata dal cliente o pagamento mai confermato: nessun addebito
);

alter table calls
  add column status           call_status not null default 'awaiting_payment',
  add column service_title    text,
  add column ring_expires_at  timestamptz,
  add column last_seen_client timestamptz,
  add column last_seen_seller timestamptz,
  add column blocks_held      integer not null default 0 check (blocks_held between 0 and 4),   -- blocchi da 15 min autorizzati
  add column extend_failed    boolean not null default false,
  add column extending_since  timestamptz,   -- blocca due rinnovi contemporanei
  add column settled_at       timestamptz,       -- quando i soldi sono stati incassati/liberati (null = da completare)
  add column options          jsonb not null default '{}';   -- es. {"recording":true,"transcript":true} quando esisteranno

comment on column calls.options is 'Servizi aggiuntivi richiesti per questa chiamata (registrazione, trascrizione AI): oggi sempre vuoto.';
comment on column calls.authorized_cents is 'Importo del primo blocco bloccato sulla carta (commissione cliente inclusa).';
comment on column calls.amount_cents is 'Importo incassato sui minuti effettivi, senza commissioni.';

alter table payments add column call_block integer check (call_block between 0 and 3);

-- una sola chiamata viva per cliente e per venditore
create unique index calls_one_live_client on calls (client_id) where status in ('awaiting_payment','ringing','active');
create unique index calls_one_live_seller on calls (seller_id) where status in ('ringing','active');
create index calls_unsettled on calls (created_at) where settled_at is null and status in ('ended','missed','declined','cancelled');
create index calls_live on calls (status) where status in ('awaiting_payment','ringing','active');

-- Il venditore sa che lo stanno chiamando: la policy calls_read (0001) gli mostra già le sue chiamate.
-- Realtime non c'è ancora: l'app interroga ogni 3 secondi (come la chat).

-- ---------- Controllo ogni minuto (chiamate in sospeso, cadute, rinnovi, incassi da completare) ----------
-- Il job riusa la riga di `expire-unpaid-bookings`, che contiene già il segreto: il segreto non passa da qui.
do $$
declare cmd text;
begin
  select command into cmd from cron.job where jobname = 'expire-unpaid-bookings';
  if cmd is not null then
    perform cron.unschedule('sweep-calls') from cron.job where jobname = 'sweep-calls';
    perform cron.schedule('sweep-calls', '* * * * *', replace(cmd, 'expire-unpaid-bookings', 'sweep-calls'));
  end if;
end $$;
