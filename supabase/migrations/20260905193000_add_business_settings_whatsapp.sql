-- QA/prod business_settings never received whatsapp.
-- resolve_business_by_slug 20260904240000 referenced it and took down the public portal.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS whatsapp text;

COMMIT;
