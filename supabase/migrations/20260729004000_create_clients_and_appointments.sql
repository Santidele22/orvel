create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null,
  phone text,
  email text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_clients_business on public.clients (business_id) where deleted_at is null;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  client_id uuid not null references public.clients(id),
  service_id uuid not null references public.services(id),
  professional_id uuid references public.professionals(id),
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null check (status in ('confirmado','en-proceso','completado','cancelado','no-asistio')),
  source text not null check (source in ('walk_in','public_booking','admin')),
  price_final numeric(12,2),
  notes text,
  canceled_at timestamptz,
  cancel_reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_appointments_business on public.appointments (business_id) where deleted_at is null;
create index idx_appointments_date on public.appointments (business_id, date) where deleted_at is null;
create index idx_appointments_professional on public.appointments (professional_id, date) where deleted_at is null;
create index idx_appointments_client on public.appointments (client_id) where deleted_at is null;
