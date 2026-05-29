-- Public booking persistence chain. Keeps customer name/phone/email and writes
-- appointments to the same public.bookings table consumed by the dashboard.

create or replace function public.create_public_booking(
  business_slug text,
  service_id text,
  starts_at_iso timestamptz,
  client jsonb,
  notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_service_id uuid := service_id::uuid;
  v_customer_id uuid;
  v_duration integer;
  v_booking_id uuid;
begin
  select b.id into v_business_id
  from public.businesses b
  where b.slug = business_slug or b.slug_canonical = public.canonical_booking_slug(business_slug)
  limit 1;

  if v_business_id is null then
    raise exception using errcode = 'P0001', message = 'BUSINESS_NOT_FOUND';
  end if;

  select coalesce(s.duration_minutes, 30) into v_duration
  from public.services s
  where s.id = v_service_id and s.business_id = v_business_id and s.active = true;

  if v_duration is null then
    raise exception using errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR';
  end if;

  insert into public.customers (business_id, full_name, email, phone)
  values (
    v_business_id,
    nullif(client ->> 'fullName', ''),
    nullif(client ->> 'email', ''),
    nullif(client ->> 'phone', '')
  )
  returning id into v_customer_id;

  insert into public.bookings (business_id, service_id, customer_id, starts_at, ends_at, status, notes)
  values (v_business_id, v_service_id, v_customer_id, starts_at_iso, starts_at_iso + make_interval(mins => v_duration), 'booked', notes)
  returning id into v_booking_id;

  return jsonb_build_object('booking_id', v_booking_id, 'customer_id', v_customer_id, 'status', 'booked');
end;
$$;
