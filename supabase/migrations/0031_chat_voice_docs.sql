-- 0031 — Chat: messaggi vocali e più tipi di documento nel bucket privato chat-media.
-- I biglietti (profilo condiviso, slot personalizzato) usano messages.attachment con kind 'profile' | 'slot': nessuna modifica alla tabella.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp',
  'video/mp4','video/quicktime','video/webm',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv',
  'audio/mp4','audio/x-m4a','audio/aac','audio/mpeg','audio/webm']
where id = 'chat-media';
