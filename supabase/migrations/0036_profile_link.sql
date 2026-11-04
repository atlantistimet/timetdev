-- Link in bio (sito, portfolio, ecc.).
alter table profiles add column if not exists link text;
alter table profiles drop constraint if exists profiles_link_len;
alter table profiles add constraint profiles_link_len check (link is null or char_length(link) <= 200);
