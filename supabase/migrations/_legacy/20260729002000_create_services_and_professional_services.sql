create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  category_id uuid not null references public.service_categories(id),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_services_business on public.services (business_id) where deleted_at is null;
create index idx_services_category on public.services (category_id) where deleted_at is null;

create table if not exists public.professional_services (
  professional_id uuid not null references public.professionals(id),
  service_id uuid not null references public.services(id),
  custom_price numeric(12,2) check (custom_price >= 0),
  created_at timestamptz not null default now(),
  primary key (professional_id, service_id)
);
