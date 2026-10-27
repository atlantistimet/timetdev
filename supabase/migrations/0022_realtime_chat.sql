-- Chat in tempo reale: i nuovi messaggi vengono spinti ai client via Supabase Realtime.
-- RLS resta valida: ognuno riceve solo i messaggi delle proprie conversazioni.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
