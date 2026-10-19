-- 0014: commenti ai post. Le recensioni (tabella reviews, 0001) hanno già le regole: solo il cliente di una prenotazione conclusa.
create table post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index post_comments_post on post_comments(post_id, created_at);
alter table post_comments enable row level security;

create policy comments_read on post_comments for select
  using (exists (select 1 from posts p where p.id = post_id and p.deleted_at is null));
create policy comments_insert on post_comments for insert
  with check (author_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and p.deleted_at is null));
-- cancella chi ha scritto il commento o chi ha scritto il post
create policy comments_delete on post_comments for delete
  using (author_id = auth.uid() or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

-- una recensione per prenotazione, mai a se stessi (già garantito da client_id <> seller_id); si può correggere il testo solo cancellando e riscrivendo: nessuna policy di update.
