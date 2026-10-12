-- =====================================================================
-- 0002 — Da Mangopay a Stripe Connect
-- Modello: il cliente paga sul conto Stripe della piattaforma (Atlantis);
-- a sessione conclusa il server trasferisce al venditore (Express account)
-- l'importo meno la commissione. Niente wallet, niente ricarica.
--  - Prenotazioni e pacchetti: addebito immediato alla prenotazione.
--  - Chiamate al minuto: blocco sulla carta (manual capture) per i minuti
--    scelti dal cliente con il cursore; a fine chiamata si incassano i
--    minuti effettivi e il resto viene rilasciato.
-- Le tabelle coinvolte sono vuote. Scrittura di denaro solo dal server.
-- =====================================================================

-- ---------- 1. Via il wallet ----------
drop table wallet_transactions;
drop table wallets;

alter table subscriptions drop column method;
alter table subscriptions rename column provider_ref to stripe_subscription_id;
alter table subscriptions add constraint subscriptions_stripe_sub_key unique (stripe_subscription_id);

drop type tx_kind;
drop type tx_status;
drop type kyc_status;
drop type pay_method;

-- ---------- 2. Nuovi tipi ----------
create type payment_status  as enum ('pending','authorized','captured','refunded','canceled','failed');
create type transfer_status as enum ('pending','paid','failed','reversed');

-- ---------- 3. Collegamenti con Stripe ----------
create table stripe_customers (               -- clienti che pagano
  user_id            uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

create table stripe_accounts (                -- venditori che incassano (account Express)
  seller_id         uuid primary key references profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,   -- il server accetta prenotazioni solo se true
  requirements_due  jsonb not null default '[]',      -- cosa manca per la verifica
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger stripe_accounts_updated before update on stripe_accounts
  for each row execute function set_updated_at();

-- ---------- 4. Pagamenti e trasferimenti ----------
create table payments (
  id                       uuid primary key default gen_random_uuid(),
  payer_id                 uuid not null references profiles(id),
  seller_id                uuid not null references profiles(id),
  stripe_payment_intent_id text not null unique,
  status                   payment_status not null default 'pending',
  currency                 text not null default 'eur' check (currency = 'eur'),
  amount_cents             integer not null check (amount_cents > 0),      -- addebitato o bloccato (commissione cliente inclusa)
  captured_cents           integer not null default 0 check (captured_cents >= 0),
  refunded_cents           integer not null default 0 check (refunded_cents >= 0),
  capture_before           timestamptz,                                    -- scadenza del blocco (solo chiamate)
  booking_id               uuid references bookings(id),                   -- prenotazione singola
  package_id               uuid,                                           -- pacchetto (stesso valore di bookings.package_id)
  call_id                  uuid references calls(id),                      -- chiamata al minuto; più pagamenti = prolungamenti
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (num_nonnulls(booking_id, package_id, call_id) = 1),
  check (captured_cents <= amount_cents),
  check (refunded_cents <= captured_cents)
);
create index payments_payer   on payments(payer_id, created_at desc);
create index payments_seller  on payments(seller_id, created_at desc);
create index payments_booking on payments(booking_id) where booking_id is not null;
create index payments_package on payments(package_id) where package_id is not null;
create index payments_call    on payments(call_id)    where call_id is not null;
create trigger payments_updated before update on payments
  for each row execute function set_updated_at();

create table transfers (                      -- giro di denaro al venditore a sessione conclusa
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments(id),
  seller_id          uuid not null references profiles(id),
  booking_id         uuid references bookings(id),
  call_id            uuid references calls(id),
  amount_cents       integer not null check (amount_cents > 0),            -- netto, commissione venditore già tolta
  stripe_transfer_id text unique,
  status             transfer_status not null default 'pending',
  created_at         timestamptz not null default now(),
  transferred_at     timestamptz,
  check (num_nonnulls(booking_id, call_id) = 1)
);
-- un solo trasferimento per prenotazione, e uno per ogni pagamento di una chiamata
create unique index transfers_one_per_booking on transfers(booking_id) where booking_id is not null;
create unique index transfers_one_per_call_payment on transfers(payment_id) where call_id is not null;
create index transfers_seller on transfers(seller_id, created_at desc);

-- ---------- 5. Chiamate al minuto: cursore del cliente ----------
-- Ogni venditore fissa da sé il prezzo al minuto (services.rate_cents_per_min)
-- e i limiti del cursore. Il cliente sceglie quanti minuti bloccare.
alter table services
  add column min_minutes integer check (min_minutes between 1 and 480),
  add column max_minutes integer check (max_minutes between 1 and 480),
  add constraint services_slider_ok check (
    kind <> 'per_minute'
    or (min_minutes is not null and max_minutes is not null and min_minutes <= max_minutes));

alter table calls rename column reserve_cents to authorized_cents;     -- importo bloccato sulla carta
alter table calls add column authorized_minutes integer not null default 0 check (authorized_minutes >= 0);
alter type call_end rename value 'balance' to 'time_limit';            -- chiusa perché finiti i minuti bloccati

-- ---------- 6. RLS: lettura solo ai diretti interessati ----------
alter table stripe_customers enable row level security;
alter table stripe_accounts  enable row level security;
alter table payments         enable row level security;
alter table transfers        enable row level security;

create policy stripe_customers_read on stripe_customers for select using (user_id = auth.uid());
create policy stripe_accounts_read  on stripe_accounts  for select using (seller_id = auth.uid());
create policy payments_read         on payments         for select using (auth.uid() in (payer_id, seller_id));
create policy transfers_read        on transfers        for select using (seller_id = auth.uid());
-- nessuna policy di insert/update/delete: scrive solo il server (service role)
