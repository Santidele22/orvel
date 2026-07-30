-- ============================================================================
-- Migration: Create business_settings — singleton row (Release 2.0 Phase 2)
-- ============================================================================
--
-- Singleton configuration row for the single tenant. Postgres enforces the
-- single-row invariant via CHECK (id = 1) on the PK.
--
-- The MVP only tracks the auto-assign toggle. Per-rubric variant columns
-- (advance-days, per-service buffers, etc.) are excluded by design (R5).
--
-- Reference: ADR 0002 §T5 (Table Design), ADR 0001 P5 (singleton enforcement),
--            R5 (business_settings flat), R7 (auto_assign default false)
-- ============================================================================

CREATE TABLE public.business_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_assign_professional BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

-- Add table comment
COMMENT ON TABLE public.business_settings IS 'Singleton tenant configuration row (ADR 0002 §T5, P5)';
COMMENT ON COLUMN public.business_settings.id IS 'Singleton enforcement: only id=1 allowed (CHECK constraint)';
COMMENT ON COLUMN public.business_settings.auto_assign_professional IS 'Auto-assign toggle: DEFAULT false means user picks a pro; true enables future auto-assign logic (R7)';
COMMENT ON COLUMN public.business_settings.created_at IS 'Audit: row creation timestamp (P3)';
COMMENT ON COLUMN public.business_settings.updated_at IS 'Audit: row last-update timestamp (P3)';
COMMENT ON COLUMN public.business_settings.created_by IS 'Audit: actor who created the row (P3)';
COMMENT ON COLUMN public.business_settings.updated_by IS 'Audit: actor who last updated the row (P3)';
COMMENT ON COLUMN public.business_settings.deleted_at IS 'Soft delete timestamp — kept for consistency, never set in practice (P2)';
