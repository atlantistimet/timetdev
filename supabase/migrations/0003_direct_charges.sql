-- =====================================================================
-- 0003 — Addebiti diretti (Stripe direct charges)
-- Sostituisce il modello della 0002 (il cliente paga Atlantis, poi Atlantis
-- trasferisce al venditore). Nuovo modello:
--  - Il cliente paga direttamente il venditore: il PaymentIntent vive
--    sull'account Stripe del venditore (header Stripe-Account).
--  - Atlantis incassa solo la propria commissione (application fee) e
--    fattura solo quella. Nessun trasferimento da parte nostra.
--  - Rimborsi e contestazioni pesano sul saldo del venditore.
--  - Account dei venditori: Accounts v2 con configurazione "merchant",
--    dashboard Express, perdite (saldi negativi) a carico di Stripe.
--  - Chiamate al minuto: blocco sulla carta (manual capture) sull'account del
--    venditore; a fine chiamata si incassano i minuti effettivi con la
--    commissione calcolata sull'importo incassato.
-- Le tabelle coinvolte sono vuote. Scrittura di denaro solo dal server.
-- =====================================================================

-- ---------- 1. Via i trasferimenti ----------
drop table transfers;          -- porta con sé indici e policy
drop type transfer_status;

-- ---------- 2. Account dei venditori ----------
alter table stripe_accounts
  add column dashboard       text not null default 'express' check (dashboard in ('express','full')),
  -- chi paga le commissioni Stripe sui pagamenti diretti: 'stripe' = le trattiene al venditore
  -- (la nostra application fee contiene solo la nostra commissione); 'application' = le paghiamo noi
  -- (la nostra application fee deve includerle). Si fissa alla creazione dell'account e non si cambia.
  add column fees_collector   text not null default 'stripe' check (fees_collector in ('stripe','application')),
  add column losses_collector text not null default 'stripe' check (losses_collector in ('stripe','application')),
  add constraint stripe_accounts_responsibilities_ok
    check (losses_collector <> 'application' or fees_collector = 'application');

-- ---------- 3. Clienti: uno per ogni account su cui si paga ----------
-- Con gli addebiti diretti l'oggetto cliente (e le carte salvate) vive sull'account
-- del venditore. stripe_account_id null = cliente sulla piattaforma.
alter table stripe_customers drop constraint stripe_customers_pkey;
alter table stripe_customers
  add column id uuid not null default gen_random_uuid(),
  add column stripe_account_id text references stripe_accounts(stripe_account_id) on delete cascade,
  add primary key (id);
create unique index stripe_customers_one_per_account
  on stripe_customers (user_id, coalesce(stripe_account_id, ''));

-- ---------- 4. Pagamenti ----------
alter table payments
  add column stripe_account_id text not null references stripe_accounts(stripe_account_id),  -- dove vive il PaymentIntent
  add column application_fee_cents integer not null default 0 check (application_fee_cents >= 0),  -- nostra commissione (cliente + venditore)
  add column application_fee_refunded_cents integer not null default 0 check (application_fee_refunded_cents >= 0),
  add constraint payments_fee_le_amount check (application_fee_cents <= amount_cents),
  add constraint payments_fee_refund_le_fee check (application_fee_refunded_cents <= application_fee_cents);
create index payments_account on payments(stripe_account_id, created_at desc);

comment on column payments.amount_cents is
  'Importo addebitato o bloccato sulla carta del cliente (prezzo + commissione cliente). Va al venditore; la nostra parte è application_fee_cents.';
comment on column payments.application_fee_cents is
  'Commissione Atlantis (cliente + venditore) trattenuta da Stripe sul pagamento. È l''unico importo che Atlantis fattura. Sulle chiamate si ricalcola alla cattura sui minuti effettivi.';
comment on column payments.stripe_payment_intent_id is
  'PaymentIntent creato sull''account del venditore: per leggerlo serve l''header Stripe-Account.';
