-- Invio delle notifiche push: quando nasce (o si aggiorna) una notifica, il database avvisa la funzione `push-send`.
-- Il segreto condiviso (CRON_SECRET) non sta nel repository: si copia in Vault, dentro il database, dal job che già lo usa.

do $$
declare s text;
begin
  if exists (select 1 from vault.secrets where name = 'cron_secret') then return; end if;
  select (regexp_match(command, 'x-cron-secret''\s*,\s*''([^'']+)''', 'i'))[1] into s from cron.job where jobname = 'expire-unpaid-bookings';
  if s is null then raise exception 'CRON_SECRET non trovato nel job expire-unpaid-bookings'; end if;
  perform vault.create_secret(s, 'cron_secret', 'Segreto condiviso con le edge function chiamate dal database');
end $$;

create or replace function public.notif_send_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'cron_secret';
  if s is null then return new; end if;
  perform net.http_post(
    url := 'https://eyhloxoknuqezjhbkzst.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('x-cron-secret', s, 'Content-Type', 'application/json'),
    body := jsonb_build_object('id', new.id)
  );
  return new;
exception when others then
  -- l'invio della push non deve mai impedire di creare la notifica
  return new;
end $$;
revoke execute on function public.notif_send_push() from public, anon, authenticated;

drop trigger if exists notifications_push_insert on public.notifications;
create trigger notifications_push_insert after insert on public.notifications
  for each row execute function public.notif_send_push();

-- Un nuovo messaggio aggiorna la notifica non letta già esistente (conteggio e data): anche questo va notificato.
drop trigger if exists notifications_push_message on public.notifications;
create trigger notifications_push_message after update of created_at on public.notifications
  for each row when (new.kind = 'message' and new.read_at is null and old.created_at is distinct from new.created_at)
  execute function public.notif_send_push();
