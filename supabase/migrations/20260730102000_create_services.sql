-- ============================================================================
-- Migration: Create services (Release 2.0 Phase 2)
-- ============================================================================
--
-- Per-service catalog. Each service belongs to one business type and carries
-- per-service timing knobs (slot duration, buffer between appointments).
--
-- Reference: ADR 0002 §T2 (Table Design), R6 (per-service timing)
-- ============================================================================

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type_id UUID NOT NULL REFERENCES public.business_types(id),
  slot_duration_minutes INT NOT NULL,
  buffer_minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

-- Add table comment
COMMENT ON TABLE public.services IS 'Per-service catalog with timing knobs (ADR 0002 §T2, R6)';
COMMENT ON COLUMN public.services.id IS 'Generated UUID identity';
COMMENT ON COLUMN public.services.name IS 'Human-readable service name';
COMMENT ON COLUMN public.services.business_type_id IS 'FK to business_types — the category this service belongs to';
COMMENT ON COLUMN public.services.slot_duration_minutes IS 'Duration of a single appointment slot in minutes (R6)';
COMMENT ON COLUMN public.services.buffer_minutes IS 'Buffer time between appointments in minutes (R6, default 0)';
COMMENT ON COLUMN public.services.created_at IS 'Audit: row creation timestamp (P3)';
COMMENT ON COLUMN public.services.updated_at IS 'Audit: row last-update timestamp (P3)';
COMMENT ON COLUMN public.services.created_by IS 'Audit: actor who created the row (P3)';
COMMENT ON COLUMN public.services.updated_by IS 'Audit: actor who last updated the row (P3)';
COMMENT ON COLUMN public.services.deleted_at IS 'Soft delete timestamp (P2)';
