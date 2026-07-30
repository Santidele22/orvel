-- Migration: 001 — Create businesses table
-- Single-tenant MVP, multi-tenant-ready (UUID PK)
-- Soft delete, audit columns, slug for public URL

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  slug text not null unique,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Index for slug lookups (public booking)
create index idx_businesses_slug on public.businesses (slug) where deleted_at is null;
