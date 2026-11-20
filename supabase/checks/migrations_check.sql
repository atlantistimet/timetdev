-- Controllo in SOLA LETTURA: dice quali migrazioni 0026-0039 hanno lasciato i loro oggetti nel database.
-- Si incolla nel SQL Editor di Supabase. Non modifica nulla.
-- Le migrazioni 0001-0025 sono già confermate in produzione e non sono ricontrollate qui.
-- Una migrazione è "ok" se TUTTI i suoi controlli sono veri; "mancanti" elenca quelli falsi.
with c(migrazione, controllo, ok) as (values
  ('0026', 'services.link_only',            exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='link_only')),
  ('0026', 'function link_service',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='link_service')),
  ('0026', 'function delete_slot_link',     exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='delete_slot_link')),

  ('0027', 'profiles.is_admin',             exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='is_admin')),
  ('0027', 'categories.parent_key',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='parent_key')),
  ('0027', 'categories.emoji',              exists(select 1 from information_schema.columns where table_schema='public' and table_name='categories' and column_name='emoji')),
  ('0027', 'function seller_stats',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='seller_stats')),
  ('0027', 'function service_ratings',      exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='service_ratings')),

  ('0028', 'bucket avatars',                exists(select 1 from storage.buckets where id='avatars')),

  ('0029', 'calls.block_minutes',           exists(select 1 from information_schema.columns where table_schema='public' and table_name='calls' and column_name='block_minutes')),
  ('0029', 'payments.call_minutes',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='call_minutes')),
  ('0029', 'payments.tip_call_id',          exists(select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='tip_call_id')),
  ('0029', 'reviews.call_id',               exists(select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='call_id')),
  ('0029', 'reviews.mood',                  exists(select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='mood')),

  ('0030', 'table message_reactions',       exists(select 1 from information_schema.tables where table_schema='public' and table_name='message_reactions')),

  ('0031', 'chat-media accetta audio/mp4',  exists(select 1 from storage.buckets where id='chat-media' and 'audio/mp4' = any(allowed_mime_types))),

  ('0032', 'services.category_key',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='category_key')),

  ('0033', 'function make_handle',          exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='make_handle')),

  ('0034', 'posts.review_id',               exists(select 1 from information_schema.columns where table_schema='public' and table_name='posts' and column_name='review_id')),
  ('0034', 'reviews.public_choice',         exists(select 1 from information_schema.columns where table_schema='public' and table_name='reviews' and column_name='public_choice')),
  ('0034', 'function answer_review_publicity', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='answer_review_publicity')),

  ('0035', 'post_tags.role',                exists(select 1 from information_schema.columns where table_schema='public' and table_name='post_tags' and column_name='role')),

  ('0036', 'profiles.link',                 exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='link')),

  ('0037', 'services.pricing',              exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='pricing')),
  ('0037', 'services.max_consecutive',      exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='max_consecutive')),
  ('0037', 'services.max_duration_min',     exists(select 1 from information_schema.columns where table_schema='public' and table_name='services' and column_name='max_duration_min')),

  ('0038', 'profiles.deleted_at',           exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='deleted_at')),
  ('0038', 'table support_tickets',         exists(select 1 from information_schema.tables where table_schema='public' and table_name='support_tickets')),

  ('0039', 'table legal_acceptances',       exists(select 1 from information_schema.tables where table_schema='public' and table_name='legal_acceptances')),
  ('0039', 'table consent_prefs',           exists(select 1 from information_schema.tables where table_schema='public' and table_name='consent_prefs')),
  ('0039', 'function accept_legal',         exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_legal'))
)
select migrazione,
       case when bool_and(ok) then 'ok' else 'MANCA' end as stato,
       coalesce(string_agg(controllo, ', ') filter (where not ok), '') as mancanti
from c
group by migrazione
order by migrazione;
