-- ============================================================================
-- Migration: Indexes — All 5 tables (Release 2.0 Phase 2)
-- ============================================================================
--
-- Every FK gets a btree index. Soft-deletable tables get partial indexes
-- WHERE deleted_at IS NULL. The composite PK on professional_services covers
-- the professional_id lookup; an explicit index on service_id covers the
-- reverse lookup.
--
-- Reference: ADR 0004 (Indexes), ADR 0001 P7 (FKs covered by indexes)
-- ============================================================================

-- ============================================================================
-- T1: business_types
-- ============================================================================
-- Implicit PK on id. Implicit UNIQUE on slug (from slug TEXT NOT NULL UNIQUE).
-- Partial index for "list active business types" query.

CREATE INDEX idx_business_types_active ON public.business_types(id) WHERE deleted_at IS NULL;


-- ============================================================================
-- T2: services
-- ============================================================================
-- FK to business_types.id → btree index on business_type_id
-- Soft-delete filtered index on business_type_id
-- Soft-delete filtered index on id for "list active services"

CREATE INDEX idx_services_business_type ON public.services(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_active ON public.services(id) WHERE deleted_at IS NULL;


-- ============================================================================
-- T3: professionals
-- ============================================================================
-- FK to business_types.id → btree index on business_type_id
-- Soft-delete filtered index on business_type_id
-- Soft-delete filtered index on id for "list active professionals"

CREATE INDEX idx_professionals_business_type ON public.professionals(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_professionals_active ON public.professionals(id) WHERE deleted_at IS NULL;


-- ============================================================================
-- T4: professional_services
-- ============================================================================
-- Composite PK (professional_id, service_id) covers the forward lookup.
-- Explicit index on service_id alone for reverse lookup.

CREATE INDEX idx_professional_services_service ON public.professional_services(service_id);


-- ============================================================================
-- T5: business_settings
-- ============================================================================
-- No additional indexes. Singleton PK on id is the only index needed.
-- ============================================================================


-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  idx_count INTEGER;
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('business_types', 'services', 'professionals', 'professional_services', 'business_settings')
    AND indexname NOT IN ('business_types_pkey', 'business_types_slug_key', 'services_pkey', 'professionals_pkey', 'business_settings_pkey');

  SELECT COUNT(*) INTO fk_count
  FROM (
    SELECT DISTINCT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
      AND table_name IN ('business_types', 'services', 'professionals', 'professional_services', 'business_settings')
  ) fks;

  RAISE NOTICE 'Index verification: % explicit indexes created (excluding PK/UNIQUE), % FK constraints', idx_count, fk_count;
END $$;
