-- Core booking RPCs. Public/admin flows share public.bookings and protect
-- capacity with overlap-safe transaction-scoped advisory locks.

create or replace function public.create_appointment(
  p_business_id uuid,
  p_service_id uuid,
  p_customer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_branch_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_requester uuid := auth.uid();
  v_capacity integer;
  v_occupied integer;
  v_booking_id uuid;
  v_bucket timestamptz;
begin
  if p_business_id is null then raise exception using errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; end if;
  if p_start_time is null then raise exception using errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; end if;
  if p_end_time is null then raise exception using errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; end if;
  if p_end_time <= p_start_time then raise exception using errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; end if;
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'UNAUTHORIZED'; end if;

  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = v_requester
  ) then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;

  for v_bucket in
    select generate_series(p_start_time, p_end_time - interval '1 millisecond', interval '30 minutes')
  loop
    perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':slot:' || v_bucket::text, 0));
  end loop;

  select b.capacity into v_capacity
  from public.businesses b
  where b.id = p_business_id
  for update;

  select count(*) into v_occupied
  from public.bookings existing
  where existing.business_id = p_business_id
    and (p_branch_id is null or existing.branch_id = p_branch_id)
    and existing.status = 'booked'
    and tstzrange(existing.starts_at, existing.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  if not exists (select 1 where v_capacity > v_occupied) then
    raise exception using errcode = 'P0001', message = 'SLOT_CONFLICT';
  end if;

  insert into public.bookings (business_id, branch_id, service_id, customer_id, starts_at, ends_at, status, notes)
  values (p_business_id, p_branch_id, p_service_id, p_customer_id, p_start_time, p_end_time, 'booked', p_notes)
  returning id into v_booking_id;

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'booked', 'remaining_capacity', v_capacity - v_occupied - 1);
end;
$$;

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
  v_business_id uuid;
  v_capacity integer;
  v_duration integer;
  v_day_start timestamptz;
begin
  select b.id, b.capacity into v_business_id, v_capacity
  from public.businesses b
  where b.slug = business_slug or b.slug_canonical = public.canonical_booking_slug(business_slug)
  limit 1;

  select coalesce(s.duration_minutes, 30) into v_duration
  from public.services s
  where s.id = service_id::uuid;

  v_day_start := (date_iso::date::text || ' 09:00 America/Argentina/Buenos_Aires')::timestamptz;

  return query
  with slots as (
    select gs as starts_at, gs + make_interval(mins => coalesce(v_duration, 30)) as ends_at
    from generate_series(v_day_start, v_day_start + interval '7 hours 30 minutes', interval '30 minutes') gs
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
