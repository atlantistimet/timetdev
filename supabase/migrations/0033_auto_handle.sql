-- Handle automatico per tutti: nome.cognome (+ 3 cifre se già preso). Poi ognuno può cambiarlo dal profilo.
create or replace function make_handle(p_full_name text) returns text language plpgsql as $$
declare
  clean text;
  parts text[];
  base text;
  candidate text;
  tries int := 0;
begin
  clean := regexp_replace(
    translate(lower(coalesce(p_full_name, '')), 'àáâäãåèéêëìíîïòóôöõùúûüçñßøæœ', 'aaaaaaeeeeiiiiooooouuuucnsoaoe'),
    '[^a-z0-9]+', ' ', 'g');
  clean := btrim(clean);
  parts := string_to_array(clean, ' ');
  if clean = '' or array_length(parts, 1) is null then
    base := 'utente';
  elsif array_length(parts, 1) = 1 then
    base := parts[1];
  else
    base := parts[1] || '.' || parts[array_length(parts, 1)];
  end if;
  base := left(base, 26);
  if length(base) < 3 then base := base || 'xx'; end if;
  candidate := base;
  while exists (select 1 from profiles where handle = candidate) loop
    tries := tries + 1;
    candidate := base || lpad((floor(random() * 1000))::int::text, 3, '0');
    exit when tries > 50;
  end loop;
  return candidate;
end $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare fname text := coalesce(new.raw_user_meta_data->>'full_name', '');
begin
  insert into profiles (id, full_name, preferred_lang, handle)
  values (new.id, fname, coalesce(new.raw_user_meta_data->>'lang', 'it'), make_handle(fname));
  return new;
end $$;

-- Chi non ha ancora un handle lo riceve ora (uno alla volta, per evitare doppioni).
do $$
declare r record;
begin
  for r in select id, full_name from profiles where handle is null order by created_at loop
    update profiles set handle = make_handle(r.full_name) where id = r.id;
  end loop;
end $$;
