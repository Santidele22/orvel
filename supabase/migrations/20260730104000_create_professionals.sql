-- ============================================================================
-- Migration: Create professionals (Release 2.0 Phase 2)
-- ============================================================================
--
-- Minimum columns: identity, business type, active flag, audit, soft delete.
-- No per-row color tokens, bio, or photo (theme tokens live in the application layer).
--
-- Reference: ADR 0002 §T3 (Table Design), R2 (no per-row color tokens)
-- ============================================================================

CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type_id UUID NOT NULL REFERENCES public.business_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

-- Add table comment
COMMENT ON TABLE public.professionals IS 'Service professionals — minimum columns (ADR 0002 §T3, R2)';
COMMENT ON COLUMN public.professionals.id IS 'Generated UUID identity';
COMMENT ON COLUMN public.professionals.name IS 'Professional display name';
COMMENT ON COLUMN public.professionals.business_type_id IS 'FK to business_types — the category this professional works in';
COMMENT ON COLUMN public.professionals.is_active IS 'Whether the professional is currently active (independent of soft delete)';
COMMENT ON COLUMN public.professionals.created_at IS 'Audit: row creation timestamp (P3)';
COMMENT ON COLUMN public.professionals.updated_at IS 'Audit: row last-update timestamp (P3)';
COMMENT ON COLUMN public.professionals.created_by IS 'Audit: actor who created the row (P3)';
COMMENT ON COLUMN public.professionals.updated_by IS 'Audit: actor who last updated the row (P3)';
COMMENT ON COLUMN public.professionals.deleted_at IS 'Soft delete timestamp (P2)';
