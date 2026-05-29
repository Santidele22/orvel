-- Business settings hardening retained separately because contracts verify the
-- centralized status constraint migration by name.

alter table public.businesses
  add column if not exists capacity integer not null default 1 check (capacity >= 1);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_status_check'
  ) then
    alter table public.bookings drop constraint bookings_status_check;
  end if;

  alter table public.bookings
    add constraint bookings_status_check check (status in ('booked', 'cancelled'));
end $$;
