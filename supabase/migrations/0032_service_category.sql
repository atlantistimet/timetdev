-- Categoria per servizio (facoltativa): scelta dal venditore quando crea il servizio.
alter table services add column if not exists category_key text references categories(key) on delete set null;
create index if not exists services_category_idx on services(category_key) where category_key is not null;
