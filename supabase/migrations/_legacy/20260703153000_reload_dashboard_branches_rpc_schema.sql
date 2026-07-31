-- Ensure PostgREST exposes the already-applied dashboard branch RPC.
-- This follow-up is intentionally forward-only: do not rewrite 20260703143000 after remote apply.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_dashboard_branches'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION 'public.get_dashboard_branches() must exist before reloading PostgREST schema cache';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
