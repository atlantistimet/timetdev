-- Sicurezza, assistenza ed eliminazione account.

alter table profiles add column if not exists deleted_at timestamptz;

-- Persone bloccate in qualunque direzione (io ho bloccato / mi hanno bloccato): da nascondere in Esplora e feed.
create or replace function blocked_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select blocked_id from user_blocks where blocker_id = auth.uid()
  union
  select blocker_id from user_blocks where blocked_id = auth.uid();
$$;
grant execute on function blocked_ids() to authenticated;

-- Segnalazioni: l'utente vede solo le proprie.
drop policy if exists reports_read_own on reports;
create policy reports_read_own on reports for select using (reporter_id = auth.uid());

-- Richieste di assistenza e contestazioni.
create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null check (kind in ('payment', 'session', 'person', 'bug', 'other')),
  ref_type    text check (ref_type in ('booking', 'call', 'profile', 'post')),
  ref_id      uuid,
  reason      text,
  body        text check (body is null or char_length(body) <= 2000),
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  admin_reply text,
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists support_tickets_user on support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status on support_tickets (status, created_at desc);
alter table support_tickets enable row level security;
drop policy if exists tickets_read_own on support_tickets;
create policy tickets_read_own on support_tickets for select using (user_id = auth.uid());
drop policy if exists tickets_insert_own on support_tickets;
create policy tickets_insert_own on support_tickets for insert with check (user_id = auth.uid() and status = 'open' and admin_reply is null);
