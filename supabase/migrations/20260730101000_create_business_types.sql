-- ============================================================================
-- Migration: Create business_types (Release 2.0 Phase 2)
-- ============================================================================
--
-- Flat catalog of business categories (hair salon, dental clinic, gym, etc.).
-- Each service and professional belongs to exactly one business type.
--
-- Reference: ADR 0002 §T1 (Table Design), ADR 0001 P1–P4
-- ============================================================================

CREATE TABLE public.business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

-- Add table comment
COMMENT ON TABLE public.business_types IS 'Flat catalog of business categories (ADR 0002 §T1)';
COMMENT ON COLUMN public.business_types.id IS 'Generated UUID identity';
COMMENT ON COLUMN public.business_types.name IS 'Human-readable business type name';
COMMENT ON COLUMN public.business_types.slug IS 'URL-safe unique identifier';
COMMENT ON COLUMN public.business_types.created_at IS 'Audit: row creation timestamp (P3)';
COMMENT ON COLUMN public.business_types.updated_at IS 'Audit: row last-update timestamp (P3)';
COMMENT ON COLUMN public.business_types.created_by IS 'Audit: actor who created the row (P3)';
COMMENT ON COLUMN public.business_types.updated_by IS 'Audit: actor who last updated the row (P3)';
COMMENT ON COLUMN public.business_types.deleted_at IS 'Soft delete timestamp (P2)';
