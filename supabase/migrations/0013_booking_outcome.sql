-- 0013: esito della sessione. Il venditore, a sessione finita, la segna "conclusa" o "assente" (nessun rimborso).
-- Le confermate finite da più di 24 ore, non segnate, diventano "concluse" da sole.
create or replace function mark_booking_outcome(p_booking uuid, p_outcome text)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if p_outcome not in ('completed', 'no_show') then raise exception 'invalid_outcome'; end if;
  select * into b from bookings where id = p_booking for update;
  if not found or b.seller_id <> auth.uid() then raise exception 'not_found'; end if;
  if b.status <> 'confirmed' then raise exception 'not_markable'; end if;
  if b.ends_at > now() then raise exception 'not_finished'; end if;
  update bookings set status = p_outcome::booking_status where id = p_booking;
end
$$;
revoke all on function mark_booking_outcome(uuid, text) from public;
revoke execute on function mark_booking_outcome(uuid, text) from anon;
grant execute on function mark_booking_outcome(uuid, text) to authenticated;

select cron.schedule('auto-complete-bookings', '*/30 * * * *',
  $$update bookings set status = 'completed' where status = 'confirmed' and ends_at < now() - interval '24 hours'$$);
