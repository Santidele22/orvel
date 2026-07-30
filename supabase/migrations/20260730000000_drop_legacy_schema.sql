-- ============================================================================
-- Migration: DROP legacy schema (Release 2.0 Phase 2)
-- ============================================================================
--
-- DROPs all 12 legacy public tables and the 1 auth.users setup user.
-- The legacy schema used the business_id FK pattern with no RLS.
-- Release 2.0 rebuilds from zero with 5 new tables.
--
-- DROP order respects FK dependencies (children before parents).
-- All 12 tables are dropped with CASCADE to handle any residual FK refs.
--
-- Reference:
--   - infra/context/migration-inventory/schema.sql (full legacy DDL)
--   - infra/context/migration-inventory/row-counts.txt (data counts)
--   - infra/context/migration-inventory/drop-report.md (post-DROP report)
-- ============================================================================

-- Step 1: Drop storage buckets if any exist
DO $$
DECLARE
  bucket_record RECORD;
BEGIN
  FOR bucket_record IN SELECT id FROM storage.buckets LOOP
    DELETE FROM storage.objects WHERE bucket_id = bucket_record.id;
    DELETE FROM storage.buckets WHERE id = bucket_record.id;
    RAISE NOTICE 'Dropped storage bucket: %', bucket_record.id;
  END LOOP;
END $$;

-- Step 2: Drop legacy public tables in dependency order
-- (leaf tables first, then their parents)

-- Leaf: no dependents beyond themselves
DROP TABLE IF EXISTS public.email_outbox CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

-- Appointments depends on clients, professionals, services
DROP TABLE IF EXISTS public.appointments CASCADE;

-- Clients depends on businesses (no other deps)
DROP TABLE IF EXISTS public.clients CASCADE;

-- Users has self-referencing FKs (created_by, updated_by) and depends on businesses, professionals
DROP TABLE IF EXISTS public.users CASCADE;

-- Professional hours depends on professionals
DROP TABLE IF EXISTS public.professional_hours CASCADE;

-- Professional services depends on professionals, services
DROP TABLE IF EXISTS public.professional_services CASCADE;

-- Services depends on businesses, service_categories
DROP TABLE IF EXISTS public.services CASCADE;

-- Service categories depends on businesses
DROP TABLE IF EXISTS public.service_categories CASCADE;

-- Professionals depends on businesses
DROP TABLE IF EXISTS public.professionals CASCADE;

-- Business settings depends on businesses
DROP TABLE IF EXISTS public.business_settings CASCADE;

-- Root table (no FKs to other domain tables)
DROP TABLE IF EXISTS public.businesses CASCADE;

-- Step 3: Remove the setup user from auth.users
-- The setup user will be recreated via Supabase dashboard after rebuild.
DELETE FROM auth.users WHERE id IS NOT NULL;

-- Step 4: Verify public schema is empty
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM pg_catalog.pg_tables
  WHERE schemaname = 'public';
  
  IF table_count > 0 THEN
    RAISE WARNING 'Public schema still has % tables after DROP', table_count;
  ELSE
    RAISE NOTICE 'Public schema is empty — ready for new migrations.';
  END IF;
END $$;
