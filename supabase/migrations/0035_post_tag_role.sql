-- Post in collaborazione: un tag può essere una semplice menzione (@ nel testo) o un collaboratore.
alter table post_tags add column if not exists role text not null default 'mention';
alter table post_tags drop constraint if exists post_tags_role_check;
alter table post_tags add constraint post_tags_role_check check (role in ('mention', 'collab'));
create index if not exists post_tags_collab_tagged on post_tags(tagged_id) where role = 'collab' and status = 'accepted';
