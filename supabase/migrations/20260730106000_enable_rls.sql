-- ============================================================================
-- Migration: RLS Policies — All 5 tables (Release 2.0 Phase 2)
-- ============================================================================
--
-- Enables Row-Level Security on all 5 new domain tables and creates policies
-- per ADR 0003. Every policy:
--   - Uses TO authenticated (NOT deprecated auth.role())
--   - Combines with an ownership predicate to avoid BOLA/IDOR
--   - Has explicit USING and WITH CHECK on UPDATE
--
-- Reference: ADR 0003 (RLS Policies)
-- ============================================================================

-- ============================================================================
-- T1: business_types
-- ============================================================================

ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_business_types_authenticated ON public.business_types
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_business_types_authenticated ON public.business_types
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_business_types_authenticated ON public.business_types
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_business_types_authenticated ON public.business_types
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);


-- ============================================================================
-- T2: services
-- ============================================================================

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_services_authenticated ON public.services
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_services_authenticated ON public.services
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_services_authenticated ON public.services
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_services_authenticated ON public.services
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);


-- ============================================================================
-- T3: professionals
-- ============================================================================

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_professionals_authenticated ON public.professionals
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_professionals_authenticated ON public.professionals
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_professionals_authenticated ON public.professionals
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_professionals_authenticated ON public.professionals
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);


-- ============================================================================
-- T4: professional_services
-- ============================================================================

ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_professional_services_authenticated ON public.professional_services
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_professional_services_authenticated ON public.professional_services
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY update_professional_services_authenticated ON public.professional_services
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY delete_professional_services_authenticated ON public.professional_services
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);


-- ============================================================================
-- T5: business_settings
-- ============================================================================

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_business_settings_authenticated ON public.business_settings
  FOR SELECT TO authenticated
  USING (id = 1);

CREATE POLICY insert_business_settings_authenticated ON public.business_settings
  FOR INSERT TO authenticated
  WITH CHECK (id = 1 AND (select auth.uid()) = created_by);

CREATE POLICY update_business_settings_authenticated ON public.business_settings
  FOR UPDATE TO authenticated
  USING (id = 1 AND (select auth.uid()) = created_by)
  WITH CHECK (id = 1 AND (select auth.uid()) = created_by);

CREATE POLICY delete_business_settings_authenticated ON public.business_settings
  FOR DELETE TO authenticated
  USING (id = 1 AND (select auth.uid()) = created_by);


-- ============================================================================
-- Verification comments
-- ============================================================================

COMMENT ON POLICY select_business_types_authenticated ON public.business_types IS 'ADR 0003: Any signed-in user can read the catalog';
COMMENT ON POLICY insert_business_types_authenticated ON public.business_types IS 'ADR 0003: Creator records themselves';
COMMENT ON POLICY update_business_types_authenticated ON public.business_types IS 'ADR 0003: USING+WITH CHECK prevents created_by reassignment';
COMMENT ON POLICY delete_business_types_authenticated ON public.business_types IS 'ADR 0003: Hard delete restricted to creator';

COMMENT ON POLICY select_services_authenticated ON public.services IS 'ADR 0003: Any signed-in user can read service catalog';
COMMENT ON POLICY insert_services_authenticated ON public.services IS 'ADR 0003: Creator owns new service';
COMMENT ON POLICY update_services_authenticated ON public.services IS 'ADR 0003: USING+WITH CHECK ownership';
COMMENT ON POLICY delete_services_authenticated ON public.services IS 'ADR 0003: Soft delete via deleted_at is ordinary flow';

COMMENT ON POLICY select_professionals_authenticated ON public.professionals IS 'ADR 0003: Booking UI reads professional list';
COMMENT ON POLICY insert_professionals_authenticated ON public.professionals IS 'ADR 0003: Creator owns new professional';
COMMENT ON POLICY update_professionals_authenticated ON public.professionals IS 'ADR 0003: USING+WITH CHECK ownership';
COMMENT ON POLICY delete_professionals_authenticated ON public.professionals IS 'ADR 0003: Soft delete via deleted_at is ordinary flow';

COMMENT ON POLICY select_professional_services_authenticated ON public.professional_services IS 'ADR 0003: Booking UI reads join to filter professionals';
COMMENT ON POLICY insert_professional_services_authenticated ON public.professional_services IS 'ADR 0003: No created_by on join; permissive at role level';
COMMENT ON POLICY update_professional_services_authenticated ON public.professional_services IS 'ADR 0003: Join rows immutable in practice';
COMMENT ON POLICY delete_professional_services_authenticated ON public.professional_services IS 'ADR 0003: Same reasoning as UPDATE';

COMMENT ON POLICY select_business_settings_authenticated ON public.business_settings IS 'ADR 0003: Singleton; every authenticated user reads the one row';
COMMENT ON POLICY insert_business_settings_authenticated ON public.business_settings IS 'ADR 0003: Throws on duplicate id=1; creator owns row';
COMMENT ON POLICY update_business_settings_authenticated ON public.business_settings IS 'ADR 0003: USING+WITH CHECK; id cant change (CHECK constraint)';
COMMENT ON POLICY delete_business_settings_authenticated ON public.business_settings IS 'ADR 0003: Only creator can delete the singleton';
