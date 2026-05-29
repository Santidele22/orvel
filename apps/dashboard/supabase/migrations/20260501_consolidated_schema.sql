-- Consolidated base schema placeholder retained for migration-equivalence tests.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

create policy businesses_owner_scope
  on public.businesses
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
