-- Dispositivi per le notifiche push (Expo Push Service, iPhone e Android).
-- Un token identifica un'installazione dell'app: se sullo stesso telefono cambia account,
-- il token passa al nuovo utente. La lingua del testo si legge da profiles.preferred_lang.

create table if not exists push_devices (
  token        text primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_user on push_devices (user_id);
alter table push_devices enable row level security;
drop policy if exists push_devices_read_own on push_devices;
create policy push_devices_read_own on push_devices for select using (user_id = auth.uid());
-- Nessuna policy di scrittura: si scrive solo con le funzioni qui sotto (e dal server con service role).

-- Registra o aggiorna il dispositivo dell'utente connesso (idempotente).
-- Security definer perché un token già legato a un altro utente va riassegnato.
create or replace function register_push_device(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid_platform'; end if;
  if p_token !~ '^(Expo|Exponent)PushToken\[.+\]$' then raise exception 'invalid_token'; end if;
  insert into push_devices (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;
revoke execute on function register_push_device(text, text) from public, anon;
grant execute on function register_push_device(text, text) to authenticated;

-- Scollega il dispositivo (disconnessione dall'app o interruttore spento).
create or replace function unregister_push_device(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from push_devices where token = p_token and user_id = auth.uid();
end $$;
revoke execute on function unregister_push_device(text) from public, anon;
grant execute on function unregister_push_device(text) to authenticated;
