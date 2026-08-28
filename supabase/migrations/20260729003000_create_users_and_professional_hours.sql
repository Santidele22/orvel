create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'professional')),
  professional_id uuid references public.professionals(id),
  name text not null,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_users_business on public.users (business_id) where deleted_at is null;

create table if not exists public.professional_hours (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  unique (professional_id, day_of_week)
);

create index idx_prof_hours_professional on public.professional_hours (professional_id);
