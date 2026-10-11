-- =====================================================================
-- Timeet Marketplace — schema iniziale (Supabase / PostgreSQL)
-- Importi sempre in centesimi di euro (integer). Date sempre timestamptz (UTC).
-- I soldi veri stanno su Mangopay: wallets / wallet_transactions sono una copia.
-- Le scritture "di denaro" (prenotazioni, chiamate, movimenti) passano solo dal
-- server (edge functions con service role): per questi dati non ci sono policy
-- di insert/update per gli utenti.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ---------- Tipi ----------
create type cancel_policy  as enum ('flessibile','moderata','rigida');
create type service_kind   as enum ('slot','per_minute','package');
create type place_kind     as enum ('online','sede','domicilio');
create type slot_status    as enum ('open','closed');
create type booking_status as enum ('confirmed','completed','cancelled','no_show');
create type booking_source as enum ('app','link');
create type call_end       as enum ('normal','balance','no_show','error');
create type tx_kind        as enum ('topup','payment','hold','release','refund','fee','payout','subscription');
create type tx_status      as enum ('pending','succeeded','failed');
create type pay_method     as enum ('card','apple_google_pay','bank_transfer','paypal','satispay','wallet');
create type kyc_status     as enum ('none','pending','validated','refused');
create type sub_kind       as enum ('pro','verified');
create type sub_status     as enum ('active','past_due','cancelled');
create type post_kind      as enum ('update','offer','slots');
create type tag_status     as enum ('pending','accepted','declined','removed');
create type media_type     as enum ('image','video');
create type content_source as enum ('author','machine');
create type report_status  as enum ('open','reviewing','closed');

-- ---------- Utility ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================
-- 1. PERSONE
-- =====================================================================
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  handle             text unique check (handle ~ '^[a-z0-9_.]{3,30}$'),
  full_name          text not null default '',
  avatar_path        text,
  role_title         text,                 -- es. "Interior designer"
  city               text,
  bio                text,
  bio_lang           text not null default 'it',
  preferred_lang     text not null default 'it',
  adult_confirmed_at timestamptz,          -- conferma maggiore età (18+)
  is_seller          boolean not null default false,
  place_type         text,                 -- studio, salone, ufficio...
  place_address      text,
  service_area       text,                 -- zona coperta a domicilio
  travel_fee_cents   integer not null default 0 check (travel_fee_cents >= 0),
  cancel_policy      cancel_policy not null default 'moderata',
  available_until    timestamptz,          -- "Disponibile ora" fino a...; null = non disponibile
  is_pro             boolean not null default false,  -- copia da subscriptions, aggiornata dal server
  is_verified        boolean not null default false,  -- spunta blu
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create table categories (
  key        text primary key,             -- 'design', 'fisco', ...
  names      jsonb not null,               -- {"it":"Design","en":"Design"}
  sort_order integer not null default 0
);

create table profile_categories (
  profile_id   uuid references profiles(id) on delete cascade,
  category_key text references categories(key) on delete cascade,
  primary key (profile_id, category_key)
);

create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on follows(followee_id);

-- =====================================================================
-- 2. SERVIZI E CALENDARIO
-- =====================================================================
create table services (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid not null references profiles(id) on delete cascade,
  kind                service_kind not null,
  title               text not null,
  description         text,
  includes            text[] not null default '{}',
  lang                text not null default 'it',
  price_cents         integer check (price_cents > 0),           -- slot e pacchetto
  rate_cents_per_min  integer check (rate_cents_per_min > 0),    -- al minuto
  duration_min        integer check (duration_min between 5 and 480),
  sessions            integer check (sessions between 2 and 50), -- solo pacchetto
  places              place_kind[] not null default '{online}',
  active              boolean not null default true,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((kind = 'per_minute' and rate_cents_per_min is not null and places = '{online}')
      or (kind = 'slot'       and price_cents is not null and duration_min is not null)
      or (kind = 'package'    and price_cents is not null and duration_min is not null and sessions is not null))
);
create index services_seller on services(seller_id) where active;
create trigger services_updated before update on services for each row execute function set_updated_at();

create table service_media (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  path       text not null,                -- percorso nello storage Supabase
  type       media_type not null,
  position   integer not null default 0
);

create table availability_slots (
  id        uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null check (ends_at > starts_at),
  status    slot_status not null default 'open',
  unique (seller_id, starts_at)
);
create index availability_seller_time on availability_slots(seller_id, starts_at);

create table offers (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references profiles(id) on delete cascade,
  service_id    uuid not null references services(id) on delete cascade,
  price_cents   integer not null check (price_cents > 0),
  duration_min  integer not null check (duration_min between 5 and 480),
  discount_pct  integer not null default 0 check (discount_pct between 0 and 90),
  validity      jsonb not null default '{"modes":[]}',  -- giorni, periodo, giorni settimana, fasce orarie
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table slot_links (                   -- "Invia slot"
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique default encode(gen_random_bytes(5),'hex'),
  seller_id          uuid not null references profiles(id) on delete cascade,
  service_id         uuid references services(id) on delete set null,
  price_cents        integer not null check (price_cents > 0),
  duration_min       integer not null check (duration_min between 5 and 480),
  discount_pct       integer not null default 0 check (discount_pct between 0 and 90),
  days               date[] not null,
  ranges             jsonb not null,         -- [{"from":"09:00","to":"13:00"}, ...]
  places             place_kind[] not null,
  extra_space_cents  integer not null default 0 check (extra_space_cents >= 0),
  extra_travel_cents integer not null default 0 check (extra_travel_cents >= 0),
  message            text,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz
);

-- =====================================================================
-- 3. PRENOTAZIONI E CHIAMATE (scrittura solo dal server)
-- =====================================================================
create table bookings (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references profiles(id),
  seller_id        uuid not null references profiles(id),
  service_id       uuid references services(id) on delete set null,
  service_title    text not null,          -- copia al momento della prenotazione
  starts_at        timestamptz not null,
  ends_at          timestamptz not null check (ends_at > starts_at),
  place            place_kind not null,
  client_address   text,
  price_cents      integer not null check (price_cents >= 0),
  client_fee_cents integer not null default 0 check (client_fee_cents >= 0),
  seller_fee_cents integer not null default 0 check (seller_fee_cents >= 0),
  extra_cents      integer not null default 0 check (extra_cents >= 0),  -- trasferta o costo spazio
  status           booking_status not null default 'confirmed',
  cancel_policy    cancel_policy not null,  -- copia al momento della prenotazione
  refund_cents     integer not null default 0,
  cancelled_at     timestamptz,
  cancelled_by     uuid references profiles(id),
  source           booking_source not null default 'app',
  slot_link_id     uuid references slot_links(id) on delete set null,
  offer_id         uuid references offers(id) on delete set null,
  package_id       uuid,                   -- stesso valore per tutte le sessioni di un pacchetto
  created_at       timestamptz not null default now(),
  check (client_id <> seller_id),
  -- niente doppie prenotazioni sovrapposte per lo stesso venditore
  exclude using gist (seller_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed')
);
create index bookings_client on bookings(client_id, starts_at desc);
create index bookings_seller on bookings(seller_id, starts_at desc);

create table calls (                        -- chiamate al minuto
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references profiles(id),
  seller_id          uuid not null references profiles(id),
  service_id         uuid references services(id) on delete set null,
  rate_cents_per_min integer not null check (rate_cents_per_min > 0),
  started_at         timestamptz,
  ended_at           timestamptz,
  billed_minutes     integer not null default 0 check (billed_minutes >= 0),
  reserve_cents      integer not null default 0,
  amount_cents       integer not null default 0,
  client_fee_cents   integer not null default 0,
  seller_fee_cents   integer not null default 0,
  end_reason         call_end,
  livekit_room       text unique,
  booking_id         uuid references bookings(id),  -- se era una sessione al minuto prenotata
  created_at         timestamptz not null default now(),
  check (client_id <> seller_id)
);
create index calls_client on calls(client_id, created_at desc);
create index calls_seller on calls(seller_id, created_at desc);

-- =====================================================================
-- 4. SOLDI (copia di Mangopay, scrittura solo dal server)
-- =====================================================================
create table wallets (
  user_id            uuid primary key references profiles(id) on delete cascade,
  mangopay_user_id   text unique,
  mangopay_wallet_id text unique,
  balance_cents      integer not null default 0,   -- copia, fonte di verità = Mangopay
  kyc                kyc_status not null default 'none',
  updated_at         timestamptz not null default now()
);

create table subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  kind               sub_kind not null,
  method             pay_method not null,
  status             sub_status not null default 'active',
  price_cents        integer not null,
  current_period_end timestamptz not null,
  provider_ref       text,
  created_at         timestamptz not null default now()
);
create unique index one_active_sub on subscriptions(user_id, kind) where status = 'active';

create table wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id),
  kind            tx_kind not null,
  amount_cents    integer not null,         -- positivo = entra nel wallet, negativo = esce
  method          pay_method,
  status          tx_status not null default 'pending',
  mangopay_id     text unique,
  booking_id      uuid references bookings(id),
  call_id         uuid references calls(id),
  subscription_id uuid references subscriptions(id),
  created_at      timestamptz not null default now()
);
create index wallet_tx_user on wallet_transactions(user_id, created_at desc);

-- =====================================================================
-- 5. SOCIAL
-- =====================================================================
create table posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references profiles(id) on delete cascade,
  kind       post_kind not null default 'update',
  body       text not null default '' check (length(body) <= 2000),
  lang       text not null default 'it',
  place      text,
  offer_id   uuid references offers(id) on delete set null,
  service_id uuid references services(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index posts_author on posts(author_id, created_at desc);
create index posts_recent on posts(created_at desc) where deleted_at is null;

create table post_media (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references posts(id) on delete cascade,
  path     text not null,
  type     media_type not null,
  position integer not null default 0
);

create table post_tags (
  post_id      uuid references posts(id) on delete cascade,
  tagged_id    uuid references profiles(id) on delete cascade,
  status       tag_status not null default 'pending',
  responded_at timestamptz,
  primary key (post_id, tagged_id)
);
create index post_tags_tagged on post_tags(tagged_id) where status = 'pending';

create table post_likes (
  post_id    uuid references posts(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(body) between 1 and 1000),
  lang       text not null default 'it',
  created_at timestamptz not null default now()
);

create table conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references profiles(id) on delete cascade,
  user_b          uuid not null references profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  check (user_a < user_b),                  -- coppia ordinata: una sola conversazione per coppia
  unique (user_a, user_b)
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  body            text not null default '' check (length(body) <= 2000),
  lang            text not null default 'it',
  attachment      jsonb,                    -- slot inviati, proposta di slot, post condiviso
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conv on messages(conversation_id, created_at);

create table reviews (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  seller_id  uuid not null references profiles(id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  body       text,
  lang       text not null default 'it',
  created_at timestamptz not null default now()
);
create index reviews_seller on reviews(seller_id, created_at desc);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,                 -- tag_request, booking, call, message, payment...
  ref_table  text,
  ref_id     uuid,
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications(user_id, created_at desc);

-- =====================================================================
-- 6. LINGUE: versioni dei contenuti (autore o traduzione automatica in cache)
-- =====================================================================
create table content_versions (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,                -- 'service','post','profile','message','review','comment'
  entity_id   uuid not null,
  field       text not null,                -- 'title','description','includes','bio','body'
  lang        text not null,
  body        text not null,
  source      content_source not null,
  created_at  timestamptz not null default now(),
  unique (entity_type, entity_id, field, lang)
);

-- =====================================================================
-- 7. SICUREZZA E OBBLIGHI
-- =====================================================================
create table reports (                      -- Digital Services Act
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id   uuid not null,
  reason      text not null,
  details     text,
  status      report_status not null default 'open',
  decision    text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create table seller_tax_info (              -- DAC7, privato
  seller_id         uuid primary key references profiles(id) on delete cascade,
  tax_code          text,
  vat_number        text,
  residence_address text,
  country           text not null default 'IT',
  updated_at        timestamptz not null default now()
);

-- Totali annui per DAC7 (prenotazioni concluse + chiamate)
create view seller_yearly_totals with (security_invoker = true) as
select seller_id, year, sum(gross_cents) as gross_cents, sum(fees_cents) as fees_cents, count(*) as transactions
from (
  select seller_id, extract(year from starts_at)::int as year, price_cents + extra_cents as gross_cents, seller_fee_cents as fees_cents
  from bookings where status = 'completed'
  union all
  select seller_id, extract(year from ended_at)::int, amount_cents, seller_fee_cents
  from calls where ended_at is not null and amount_cents > 0
) t group by seller_id, year;

-- =====================================================================
-- TRIGGER
-- =====================================================================
-- profilo creato automaticamente alla registrazione
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, preferred_lang)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'lang','it'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- data dell'ultimo messaggio sulla conversazione
create or replace function touch_conversation() returns trigger language plpgsql security definer set search_path = public as $$
begin update conversations set last_message_at = new.created_at where id = new.conversation_id; return new; end $$;
create trigger messages_touch after insert on messages for each row execute function touch_conversation();

-- richiesta di tag → notifica al taggato
create or replace function notify_tag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, ref_table, ref_id, payload)
  values (new.tagged_id, 'tag_request', 'posts', new.post_id, jsonb_build_object('author_id', (select author_id from posts where id = new.post_id)));
  return new;
end $$;
create trigger post_tags_notify after insert on post_tags for each row execute function notify_tag();

-- =====================================================================
-- RLS (Row Level Security)
-- =====================================================================
alter table profiles            enable row level security;
alter table categories          enable row level security;
alter table profile_categories  enable row level security;
alter table follows             enable row level security;
alter table services            enable row level security;
alter table service_media       enable row level security;
alter table availability_slots  enable row level security;
alter table offers              enable row level security;
alter table slot_links          enable row level security;
alter table bookings            enable row level security;
alter table calls               enable row level security;
alter table wallets             enable row level security;
alter table subscriptions       enable row level security;
alter table wallet_transactions enable row level security;
alter table posts               enable row level security;
alter table post_media          enable row level security;
alter table post_tags           enable row level security;
alter table post_likes          enable row level security;
alter table comments            enable row level security;
alter table conversations       enable row level security;
alter table messages            enable row level security;
alter table reviews             enable row level security;
alter table notifications       enable row level security;
alter table content_versions    enable row level security;
alter table reports             enable row level security;
alter table seller_tax_info     enable row level security;

-- Profili: pubblici in lettura, modificabili solo dal proprietario.
-- Campi gestiti dal server (is_pro, is_verified) protetti da trigger sotto.
create policy profiles_read   on profiles for select using (true);
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function protect_profile_fields() returns trigger language plpgsql as $$
begin
  if current_user not in ('service_role','postgres','supabase_admin') then  -- solo il server può cambiarli
    new.is_pro := old.is_pro; new.is_verified := old.is_verified;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles for each row execute function protect_profile_fields();

create policy categories_read on categories for select using (true);
create policy pc_read  on profile_categories for select using (true);
create policy pc_write on profile_categories for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy follows_read   on follows for select using (true);
create policy follows_insert on follows for insert with check (follower_id = auth.uid());
create policy follows_delete on follows for delete using (follower_id = auth.uid());

-- Servizi, media, disponibilità, offerte: pubblici in lettura, gestiti dal venditore
create policy services_read  on services for select using (active or seller_id = auth.uid());
create policy services_write on services for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy smedia_read    on service_media for select using (true);
create policy smedia_write   on service_media for all
  using (exists (select 1 from services s where s.id = service_id and s.seller_id = auth.uid()))
  with check (exists (select 1 from services s where s.id = service_id and s.seller_id = auth.uid()));
create policy avail_read     on availability_slots for select using (true);
create policy avail_write    on availability_slots for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy offers_read    on offers for select using (active or seller_id = auth.uid());
create policy offers_write   on offers for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- Link "Invia slot": il proprietario li gestisce; chi ha il codice li legge tramite funzione
create policy links_owner on slot_links for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create or replace function slot_link_by_code(p_code text) returns setof slot_links
language sql stable security definer set search_path = public as $$
  select * from slot_links where code = p_code and (expires_at is null or expires_at > now());
$$;

-- Prenotazioni, chiamate, soldi: solo lettura per i diretti interessati
create policy bookings_read on bookings for select using (auth.uid() in (client_id, seller_id));
create policy calls_read    on calls    for select using (auth.uid() in (client_id, seller_id));
create policy wallets_read  on wallets  for select using (user_id = auth.uid());
create policy subs_read     on subscriptions for select using (user_id = auth.uid());
create policy wtx_read      on wallet_transactions for select using (user_id = auth.uid());

-- Post
create policy posts_read   on posts for select using (deleted_at is null or author_id = auth.uid());
create policy posts_insert on posts for insert with check (author_id = auth.uid());
create policy posts_update on posts for update using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy pmedia_read  on post_media for select using (true);
create policy pmedia_write on post_media for all
  using (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

-- Tag: tutti vedono solo quelli accettati; autore e taggato vedono anche gli altri.
-- L'autore crea il tag (sempre 'pending'); solo il taggato cambia lo stato.
create policy tags_read on post_tags for select using (
  status = 'accepted' or tagged_id = auth.uid()
  or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));
create policy tags_insert on post_tags for insert with check (
  status = 'pending' and exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));
create policy tags_answer on post_tags for update using (tagged_id = auth.uid()) with check (tagged_id = auth.uid());

create policy likes_read   on post_likes for select using (true);
create policy likes_insert on post_likes for insert with check (user_id = auth.uid());
create policy likes_delete on post_likes for delete using (user_id = auth.uid());

create policy comments_read   on comments for select using (true);
create policy comments_insert on comments for insert with check (author_id = auth.uid());
create policy comments_delete on comments for delete using (author_id = auth.uid());

-- Chat: solo i partecipanti
create policy conv_read   on conversations for select using (auth.uid() in (user_a, user_b));
create policy conv_insert on conversations for insert with check (auth.uid() in (user_a, user_b));
create policy msg_read    on messages for select using (exists (
  select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
create policy msg_insert  on messages for insert with check (sender_id = auth.uid() and exists (
  select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));
create policy msg_read_mark on messages for update using (exists (
  select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)) and sender_id <> auth.uid());

-- Recensioni: pubbliche; solo il cliente di una prenotazione conclusa può scriverne una
create policy reviews_read   on reviews for select using (true);
create policy reviews_insert on reviews for insert with check (
  author_id = auth.uid() and exists (
    select 1 from bookings b where b.id = booking_id and b.client_id = auth.uid()
      and b.seller_id = reviews.seller_id and b.status = 'completed'));

create policy notif_read   on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Traduzioni: lettura pubblica; scrittura dal server (traduzioni automatiche)
-- e dall'autore per le proprie versioni (gestita via funzione server per validare la proprietà)
create policy cv_read on content_versions for select using (true);

create policy reports_insert on reports for insert with check (reporter_id = auth.uid());
create policy reports_read   on reports for select using (reporter_id = auth.uid());

create policy tax_own on seller_tax_info for all using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- =====================================================================
-- DATI INIZIALI
-- =====================================================================
insert into categories (key, names, sort_order) values
 ('design','{"it":"Design","en":"Design"}',1),
 ('fisco','{"it":"Fisco","en":"Tax"}',2),
 ('carriera','{"it":"Carriera","en":"Career"}',3),
 ('tech','{"it":"Tech","en":"Tech"}',4),
 ('musica','{"it":"Musica","en":"Music"}',5),
 ('bellezza','{"it":"Bellezza","en":"Beauty"}',6),
 ('foto','{"it":"Foto","en":"Photo"}',7),
 ('benessere','{"it":"Benessere","en":"Wellbeing"}',8),
 ('lingue','{"it":"Lingue","en":"Languages"}',9),
 ('legale','{"it":"Legale","en":"Legal"}',10),
 ('marketing','{"it":"Marketing","en":"Marketing"}',11),
 ('cucina','{"it":"Cucina","en":"Cooking"}',12),
 ('fitness','{"it":"Fitness","en":"Fitness"}',13),
 ('casa','{"it":"Casa e riparazioni","en":"Home and repairs"}',14),
 ('viaggi','{"it":"Viaggi","en":"Travel"}',15),
 ('animali','{"it":"Animali","en":"Pets"}',16);
