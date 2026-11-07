-- Accettazioni dei documenti legali e consensi, con data e versione come prova.

create table if not exists legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  doc         text not null check (doc in ('terms', 'privacy', 'community', 'seller')),
  version     text not null,
  locale      text,
  accepted_at timestamptz not null default now(),
  unique (user_id, doc, version)
);
create index if not exists legal_acceptances_user on legal_acceptances (user_id, accepted_at desc);
alter table legal_acceptances enable row level security;
drop policy if exists legal_acceptances_read_own on legal_acceptances;
create policy legal_acceptances_read_own on legal_acceptances for select using (user_id = auth.uid());

-- Preferenze di consenso correnti (una riga per persona).
create table if not exists consent_prefs (
  user_id         uuid primary key references profiles(id) on delete cascade,
  marketing_email boolean not null default false,
  marketing_push  boolean not null default false,
  personalization boolean not null default true,
  analytics       boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table consent_prefs enable row level security;
drop policy if exists consent_prefs_read_own on consent_prefs;
create policy consent_prefs_read_own on consent_prefs for select using (user_id = auth.uid());

-- Storico di ogni cambio di consenso (prova).
create table if not exists consent_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  key        text not null check (key in ('marketing_email', 'marketing_push', 'personalization', 'analytics')),
  granted    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists consent_events_user on consent_events (user_id, created_at desc);
alter table consent_events enable row level security;
drop policy if exists consent_events_read_own on consent_events;
create policy consent_events_read_own on consent_events for select using (user_id = auth.uid());

-- Registra l'accettazione di uno o più documenti (idempotente).
create or replace function accept_legal(p_docs text[], p_version text, p_locale text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  foreach d in array p_docs loop
    insert into legal_acceptances (user_id, doc, version, locale)
    values (auth.uid(), d, p_version, p_locale)
    on conflict (user_id, doc, version) do nothing;
  end loop;
end $$;
grant execute on function accept_legal(text[], text, text) to authenticated;

-- Imposta un consenso e ne conserva lo storico.
create or replace function set_consent(p_key text, p_granted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_key not in ('marketing_email', 'marketing_push', 'personalization', 'analytics') then
    raise exception 'invalid_key';
  end if;
  insert into consent_prefs (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  execute format('update consent_prefs set %I = $1, updated_at = now() where user_id = $2', p_key)
    using p_granted, auth.uid();
  insert into consent_events (user_id, key, granted) values (auth.uid(), p_key, p_granted);
end $$;
grant execute on function set_consent(text, boolean) to authenticated;
