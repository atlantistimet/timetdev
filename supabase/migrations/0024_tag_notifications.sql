-- 0024 — Tag: la richiesta indica chi tagga; l'autore viene avvisato quando il tag è accettato.
create or replace function notify_tag() returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select author_id into a from posts where id = new.post_id;
  perform notif_push(new.tagged_id, 'tag_request', 'posts', new.post_id, jsonb_build_object('author_id', a, 'name', notif_name(a)));
  return new;
end $$;

create or replace function notify_tag_answer() returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  if old.status = 'pending' and new.status = 'accepted' then
    select author_id into a from posts where id = new.post_id;
    perform notif_push(a, 'tag_accepted', 'posts', new.post_id, jsonb_build_object('name', notif_name(new.tagged_id), 'handle', (select handle from profiles where id = new.tagged_id)));
  end if;
  return new;
end $$;
drop trigger if exists post_tags_answer_notify on post_tags;
create trigger post_tags_answer_notify after update of status on post_tags for each row execute function notify_tag_answer();
