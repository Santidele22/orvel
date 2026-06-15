-- Availability RPC compatibility migration. The canonical implementation uses
-- America/Argentina/Buenos_Aires, 30-minute slots and overlap occupancy.

create or replace function public.query_public_slot_availability(
  business_slug text,
  service_id text,
  date_iso text
)
returns table(starts_at_iso timestamptz, ends_at_iso timestamptz, remaining_capacity integer)
language plpgsql
stable
as $$
declare
  slot_interval_minutes integer := 30;
  v_timezone text := 'America/Argentina/Buenos_Aires';
  v_business_id uuid;
  v_capacity integer;
  v_duration integer;
  v_day_start timestamptz;
begin
  select b.id, b.capacity, b.timezone into v_business_id, v_capacity, v_timezone
  from public.businesses b
  where b.slug = business_slug or b.slug_canonical = public.canonical_booking_slug(business_slug)
  limit 1;

  select coalesce(s.duration_minutes, 30) into v_duration
  from public.services s
  where s.id = service_id::uuid;

  v_day_start := (date_iso::date::text || ' 09:00 ' || coalesce(v_timezone, 'America/Argentina/Buenos_Aires'))::timestamptz;

  return query
  with slots as (
    select gs as starts_at, gs + make_interval(mins => coalesce(v_duration, 30)) as ends_at
    from generate_series(v_day_start, v_day_start + interval '7 hours 30 minutes', make_interval(mins => slot_interval_minutes)) gs
  ), occupied as (
    select s.starts_at, s.ends_at, count(bk.*)::integer as used
    from slots s
    left join public.bookings bk
      on bk.business_id = v_business_id
     and bk.status = 'booked'
     and tstzrange(bk.starts_at, bk.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
    group by s.starts_at, s.ends_at
  )
  select starts_at, ends_at, greatest(0, coalesce(v_capacity, 1) - used) as remaining_capacity
  from occupied
  where coalesce(v_capacity, 1) - used > 0;
end;
$$;
