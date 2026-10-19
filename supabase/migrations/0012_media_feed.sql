-- =====================================================================
-- 0012 — Media (foto e video) e feed
-- Bucket "media" per post e anteprime dei link; i bucket accettano anche video (max 50 MB).
-- Post: riferimento al link "Invia slot", controlli di coerenza e di proprietà.
-- Link "Invia slot": immagine o video di anteprima.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'];

update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
where id = 'service-media';

create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anteprima dei link
alter table slot_links add column preview_path text;
alter table slot_links add column preview_type media_type;
alter table slot_links add constraint slot_links_preview_pair check ((preview_path is null) = (preview_type is null));

-- Post
alter table posts add column slot_link_id uuid references slot_links(id) on delete set null;
alter table posts add constraint posts_kind_refs check (
  (kind = 'update') or (kind = 'offer' and offer_id is not null) or (kind = 'slots' and slot_link_id is not null)
);

create or replace function check_post_refs() returns trigger language plpgsql as $$
begin
  if new.offer_id is not null and not exists (select 1 from offers o where o.id = new.offer_id and o.seller_id = new.author_id) then
    raise exception 'offer does not belong to the author' using errcode = '23514';
  end if;
  if new.service_id is not null and not exists (select 1 from services s where s.id = new.service_id and s.seller_id = new.author_id) then
    raise exception 'service does not belong to the author' using errcode = '23514';
  end if;
  if new.slot_link_id is not null and not exists (select 1 from slot_links l where l.id = new.slot_link_id and l.seller_id = new.author_id) then
    raise exception 'link does not belong to the author' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger posts_refs before insert or update of offer_id, service_id, slot_link_id, author_id on posts
  for each row execute function check_post_refs();

-- Chi vede un post con un link "Invia slot" può leggere quel link (lo ha pubblicato l'autore apposta)
create policy links_published_read on slot_links for select to authenticated
  using (exists (select 1 from posts p where p.slot_link_id = slot_links.id and p.deleted_at is null));

-- Massimo 6 foto/video per post
create or replace function check_post_media_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from post_media where post_id = new.post_id) >= 6 then
    raise exception 'too_many_media';
  end if;
  return new;
end $$;
create trigger post_media_limit before insert on post_media for each row execute function check_post_media_limit();

create index posts_author_recent on posts(author_id, created_at desc) where deleted_at is null;
