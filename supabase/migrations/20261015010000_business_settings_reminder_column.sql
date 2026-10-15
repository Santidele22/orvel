-- business_settings.send_appointment_reminders_24h is declared in
-- 20260501_consolidated_schema.sql but prod never received it: the consolidated
-- schema was edited after prod applied it (content drift the filename-based
-- drift guard cannot see). enqueue_appointment_reminders_24h references the
-- column and failed with 42703 after the 20261015003000 join fix.
-- Idempotent; DEFAULT true preserves the behavior the reminder function assumes.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS send_appointment_reminders_24h boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';

COMMIT;
