-- Enable RLS on 20260729 public tables created without it.
-- No policies: default-deny for anon/authenticated. Service role bypasses RLS.
-- Skip missing tables so remotes without the parallel schema still apply this migration.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.professionals') IS NOT NULL THEN
    ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.professional_services') IS NOT NULL THEN
    ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.professional_hours') IS NOT NULL THEN
    ALTER TABLE public.professional_hours ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.service_categories') IS NOT NULL THEN
    ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.clients') IS NOT NULL THEN
    ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.appointments') IS NOT NULL THEN
    ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.email_outbox') IS NOT NULL THEN
    ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;
