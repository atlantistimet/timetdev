-- =====================================================================
-- 0008 — Orari occupati di un venditore, visibili a tutti senza dati personali
-- Le prenotazioni sono leggibili solo da chi le fa e da chi le riceve; per non proporre orari già presi
-- il cliente chiede solo gli intervalli occupati (nessun nome, nessun importo).
-- =====================================================================
create or replace function seller_busy(p_seller uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at
  from bookings b
  where b.seller_id = p_seller and b.status = 'confirmed' and b.starts_at < p_to and b.ends_at > p_from
  order by b.starts_at
$$;
revoke all on function seller_busy(uuid, timestamptz, timestamptz) from public;
grant execute on function seller_busy(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function seller_busy(uuid, timestamptz, timestamptz) from anon;
