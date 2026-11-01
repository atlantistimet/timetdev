-- =====================================================================
-- 0028 — Foto profilo
-- Bucket pubblico in lettura "avatars"; ognuno scrive e cancella solo nella propria cartella (<user_id>/...).
-- Una sola foto per profilo: il percorso corrente sta in profiles.avatar_path (colonna già esistente).
-- Formati: JPEG, PNG, WebP, massimo 2 MB (l'app ridimensiona prima di caricare).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy avatars_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
