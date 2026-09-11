-- QA/prod business_settings never received allow_client_professional_selection.
-- resolve_business_by_slug 20260901020000 referenced it and took down the public portal.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS allow_client_professional_selection boolean NOT NULL DEFAULT false;

COMMIT;
