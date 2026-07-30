-- ============================================================================
-- Migration: Create professional_services — N:M join (Release 2.0 Phase 2)
-- ============================================================================
--
-- N:M join between professionals and services. The booking UI joins through
-- this table to filter eligible professionals per service.
--
-- Both FKs have ON DELETE CASCADE so hard-deleting a professional or service
-- cleans up the join. Soft deletes (via deleted_at) keep join rows intact.
--
-- No created_by / updated_by — a join row has no meaningful update workflow.
-- Only the immutable creation timestamp is tracked.
--
-- Reference: ADR 0002 §T4 (Table Design), R3 (N:M join)
-- ============================================================================

CREATE TABLE public.professional_services (
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, service_id)
);

-- Add table comment
COMMENT ON TABLE public.professional_services IS 'N:M join between professionals and services (ADR 0002 §T4, R3)';
COMMENT ON COLUMN public.professional_services.professional_id IS 'FK to professionals — part of composite PK (ON DELETE CASCADE)';
COMMENT ON COLUMN public.professional_services.service_id IS 'FK to services — part of composite PK (ON DELETE CASCADE)';
COMMENT ON COLUMN public.professional_services.created_at IS 'Immutable creation timestamp of the join';
