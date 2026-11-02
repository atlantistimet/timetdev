-- =====================================================================
-- 0030 — Reazioni ai messaggi della chat
--  Una reazione (emoji) per persona e per messaggio. La vedono solo i due partecipanti della conversazione.
--  Le emoji sono nomi fissi (le stesse immagini dell'app), non testo libero.
-- =====================================================================
create table public.message_reactions (
  message_id      uuid not null references public.messages(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  emoji           text not null check (emoji in ('fire', 'raising_hands', 'heart_hands', 'thumbs_up', 'smiling_eyes', 'party_popper')),
  created_at      timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reactions_conv on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

create policy reactions_read on public.message_reactions for select using (exists (
  select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b)));

-- si reagisce solo nelle proprie conversazioni, a un messaggio di quella conversazione, come se stessi
create policy reactions_insert on public.message_reactions for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b))
  and exists (select 1 from public.messages m where m.id = message_id and m.conversation_id = message_reactions.conversation_id));
create policy reactions_update on public.message_reactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete on public.message_reactions for delete using (user_id = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
