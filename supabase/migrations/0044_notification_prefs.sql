-- Scelte sulle notifiche push, una per categoria (prenotazioni, messaggi, pagamenti e mance, chiamate perse, community, recensioni, disponibilità).
-- Riguardano solo la push sul telefono: l'elenco Notifiche dentro l'app riceve sempre tutto.
-- Senza riga la categoria è accesa. Chi manda la push (`push-send`) salta le categorie spente; i tipi di notifica sono raggruppati in `_shared/push-categories.ts`.

create table if not exists notification_prefs (
  user_id    uuid not null references profiles(id) on delete cascade,
  category   text not null check (category in ('bookings', 'messages', 'payments', 'calls', 'community', 'reviews', 'availability')),
  push       boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table notification_prefs enable row level security;
drop policy if exists notification_prefs_read_own on notification_prefs;
create policy notification_prefs_read_own on notification_prefs for select using (user_id = auth.uid());
-- Nessuna policy di scrittura: si scrive solo con la funzione qui sotto.

create or replace function set_push_category(p_category text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into notification_prefs (user_id, category, push)
  values (auth.uid(), p_category, p_enabled)
  on conflict (user_id, category) do update set push = excluded.push, updated_at = now();
end $$;
revoke execute on function set_push_category(text, boolean) from public, anon;
grant execute on function set_push_category(text, boolean) to authenticated;
