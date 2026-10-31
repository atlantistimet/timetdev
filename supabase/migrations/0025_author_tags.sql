-- 0025 — L'autore aggiunge o toglie tag su un post già pubblicato.
-- Risposte: ok | max | declined | invalid
-- · max: già 5 tag attivi (in attesa o accettati)
-- · declined: quella persona ha già rifiutato o tolto il tag: non si può ritaggare
create or replace function set_post_tag(p_post uuid, p_user uuid, p_add boolean) returns text
language plpgsql security definer set search_path = public as $$
declare author uuid; cur text; active int;
begin
  select author_id into author from posts where id = p_post and deleted_at is null;
  if author is null or author <> auth.uid() or p_user = author then return 'invalid'; end if;
  select status::text into cur from post_tags where post_id = p_post and tagged_id = p_user;
  if not p_add then
    if cur in ('pending', 'accepted') then delete from post_tags where post_id = p_post and tagged_id = p_user; end if;
    return 'ok';
  end if;
  if cur in ('pending', 'accepted') then return 'ok'; end if;
  if cur is not null then return 'declined'; end if;
  select count(*) into active from post_tags where post_id = p_post and status in ('pending', 'accepted');
  if active >= 5 then return 'max'; end if;
  insert into post_tags (post_id, tagged_id) values (p_post, p_user);
  return 'ok';
end $$;
grant execute on function set_post_tag(uuid, uuid, boolean) to authenticated;
