-- Repair upgraded production schemas where business_settings was first created by
-- 20260420121000_booking_core_schema.sql. The later consolidated schema used
-- CREATE TABLE IF NOT EXISTS, so these signup columns were not backfilled there.
BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS support_phone text;

COMMIT;
