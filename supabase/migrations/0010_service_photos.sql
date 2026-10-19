-- =====================================================================
-- 0010 — Foto dei servizi
-- Bucket pubblico in lettura "service-media"; ogni venditore scrive solo nella propria cartella (<user_id>/...).
-- Massimo 6 foto per servizio.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-media', 'service-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy service_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'service-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy service_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'service-media' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function check_service_media_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from service_media where service_id = new.service_id) >= 6 then
    raise exception 'too_many_photos';
  end if;
  return new;
end $$;
create trigger service_media_limit before insert on service_media for each row execute function check_service_media_limit();
