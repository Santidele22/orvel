-- Booking core schema restored as an executable baseline for the booking RPCs.
-- It models tenants, branches, customers, services, bookings, blocked time and
-- notification outbox records used by the current Angular data-access layer.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  slug text unique,
  name text not null default 'Orvel Business',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  capacity integer not null default 1 check (capacity >= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  display_name text not null,
  rubro text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  working_hours jsonb not null default '{}'::jsonb,
  buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  min_notice_minutes integer not null default 0 check (min_notice_minutes >= 0),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes > 0),
  cancellation_window_minutes integer not null default 60 check (cancellation_window_minutes >= 0),
  auto_confirm boolean not null default true,
  allow_client_professional_selection boolean not null default false,
  support_email text,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint bookings_status_check check (status in ('booked', 'cancelled'))
);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  to_email text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists bookings_business_starts_idx on public.bookings (business_id, starts_at);
create index if not exists bookings_branch_starts_idx on public.bookings (branch_id, starts_at) where branch_id is not null;
create index if not exists blocked_times_business_starts_idx on public.blocked_times (business_id, starts_at);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.branches enable row level security;
alter table public.business_settings enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.blocked_times enable row level security;
alter table public.notification_email_outbox enable row level security;
