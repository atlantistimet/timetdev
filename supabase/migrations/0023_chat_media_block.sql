-- 0023 — Chat: foto, video e PDF privati; blocco utenti.
-- I file stanno in un bucket PRIVATO: cartella = id della conversazione, accesso solo ai due partecipanti.
-- Il messaggio con allegato usa messages.attachment = {"kind":"media","type":"image|video|file","path","name","size","mime"}.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf'];

create or replace function is_conversation_member(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = conv and auth.uid() in (c.user_a, c.user_b));
$$;

create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and is_conversation_member(((storage.foldername(name))[1])::uuid));
create policy chat_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and is_conversation_member(((storage.foldername(name))[1])::uuid));

-- Blocchi
create table user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table user_blocks enable row level security;
create policy blocks_read on user_blocks for select using (blocker_id = auth.uid());

create or replace function is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or target = auth.uid() then raise exception 'invalid'; end if;
  insert into user_blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
end $$;

create or replace function unblock_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from user_blocks where blocker_id = auth.uid() and blocked_id = target;
end $$;

grant execute on function block_user(uuid), unblock_user(uuid) to authenticated;

-- Chi è bloccato (da me o da lui) non può scrivere
drop policy msg_insert on messages;
create policy msg_insert on messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)
      and not is_blocked_between(c.user_a, c.user_b)
  )
);
