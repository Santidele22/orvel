-- ============================================================================
-- Seed: Orvel test data for orvel-qa-dev (dev environment)
-- ============================================================================
-- Idempotent: safe to run multiple times. Uses fixed UUIDs so re-runs are no-ops.
-- Apply via: supabase db execute --file supabase/seed.sql
--            OR via dashboard SQL editor.
-- ----------------------------------------------------------------------------
-- Test credentials:
--   email:    test@orvel.dev
--   password: orvel1234!
-- ----------------------------------------------------------------------------
-- Includes:
--   1 business, 1 service category, 2 services, 1 professional, 1 admin user,
--   2 clients, 3 appointments (today + tomorrow), 1 business_settings row.
-- ============================================================================

set search_path = public;

-- ── 1. Business ─────────────────────────────────────────────────────────────
insert into public.businesses (id, name, slug, phone, email, address)
values (
  '00000000-0000-0000-0000-000000000001',
  'Orvel Test Salón',
  'orvel-test',
  '+541155551000',
  'test@orvel.dev',
  'Av. Test 1234, CABA'
)
on conflict (id) do nothing;

-- ── 2. Service category ────────────────────────────────────────────────────
insert into public.service_categories (id, business_id, name, description)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Uñas',
  'Servicios de manicura, gel y acrílico'
)
on conflict (id) do nothing;

-- ── 3. Services (2) ─────────────────────────────────────────────────────────
insert into public.services (id, business_id, category_id, name, description, duration_minutes, price, active)
values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'Manicura',
  'Manicura completa con esmaltado tradicional',
  30,
  5000.00,
  true
)
on conflict (id) do nothing;

insert into public.services (id, business_id, category_id, name, description, duration_minutes, price, active)
values (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'Gel',
  'Esmaltado gel semipermanente',
  60,
  9000.00,
  true
)
on conflict (id) do nothing;

-- ── 4. Professional ────────────────────────────────────────────────────────
insert into public.professionals (id, business_id, name, phone, email, active)
values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',
  'María Test',
  '+541155551001',
  'maria@orvel.dev',
  true
)
on conflict (id) do nothing;

-- ── 5. Auth user (Supabase auth) ───────────────────────────────────────────
-- pgcrypto's crypt() with bcrypt — matches Supabase Auth's password hashing.
-- email_confirmed_at = now() so the user can log in immediately without email verification.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000040',
  'authenticated',
  'authenticated',
  'test@orvel.dev',
  crypt('orvel1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nombre":"María","apellido":"Test","negocioNombre":"Orvel Test Salón","tipoNegocio":"unas","telefono":"+541155551001"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- ── 5b. Auth identity (required for signInWithEmailAndPassword) ────────────
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000040',
  '{"sub":"00000000-0000-0000-0000-000000000040","email":"test@orvel.dev","email_verified":true}'::jsonb,
  'email',
  '00000000-0000-0000-0000-000000000040',
  now(),
  now(),
  now()
)
on conflict (id) do nothing;

-- ── 6. Public user (domain profile linked to auth user) ───────────────────
insert into public.users (id, business_id, professional_id, email, password_hash, role, name, email_verified_at)
values (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000030',
  'test@orvel.dev',
  crypt('orvel1234!', gen_salt('bf')),
  'admin',
  'María Test',
  now()
)
on conflict (id) do nothing;

-- ── 7. Business settings (defaults) ────────────────────────────────────────
insert into public.business_settings (business_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (business_id) do nothing;

-- ── 8. Clients (2) ─────────────────────────────────────────────────────────
insert into public.clients (id, business_id, name, phone, email, notes)
values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000001',
  'Ana Pérez',
  '+541155551234',
  'ana@example.com',
  'Clienta frecuente, prefiere gel'
)
on conflict (id) do nothing;

insert into public.clients (id, business_id, name, phone, email, notes)
values (
  '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000001',
  'Lucía Gómez',
  '+541155551235',
  'lucia@example.com',
  'Nueva clienta, primer turno de prueba'
)
on conflict (id) do nothing;

-- ── 9. Appointments (3) ───────────────────────────────────────────────────
-- 2 today + 1 tomorrow, various statuses for testing the agenda.
insert into public.appointments (
  id, business_id, client_id, service_id, professional_id,
  date, start_time, end_time, status, source, price_final, notes
)
values (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000030',
  current_date,
  '10:00:00',
  '10:30:00',
  'confirmado',
  'admin',
  5000.00,
  'Cliente pidió esmalte rojo'
)
on conflict (id) do nothing;

insert into public.appointments (
  id, business_id, client_id, service_id, professional_id,
  date, start_time, end_time, status, source, price_final
)
values (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000030',
  current_date,
  '14:00:00',
  '15:00:00',
  'confirmado',
  'public_booking',
  9000.00
)
on conflict (id) do nothing;

insert into public.appointments (
  id, business_id, client_id, service_id, professional_id,
  date, start_time, end_time, status, source, price_final
)
values (
  '00000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000030',
  current_date + 1,
  '11:00:00',
  '11:30:00',
  'confirmado',
  'admin',
  5000.00
)
on conflict (id) do nothing;

-- ── Verification ───────────────────────────────────────────────────────────
-- Run separately to confirm:
--   select count(*) from public.businesses;          -- 1
--   select count(*) from public.service_categories;  -- 1
--   select count(*) from public.services;            -- 2
--   select count(*) from public.professionals;       -- 1
--   select count(*) from auth.users;                 -- 1
--   select count(*) from auth.identities;            -- 1
--   select count(*) from public.users;               -- 1
--   select count(*) from public.clients;             -- 2
--   select count(*) from public.appointments;        -- 3
--   select count(*) from public.business_settings;   -- 1
