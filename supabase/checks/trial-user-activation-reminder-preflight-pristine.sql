-- Read-only gate for a database before either reminder migration.
DO $$
BEGIN
  IF to_regclass('public.one_time_email_attempts') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration/table state mismatch';
  END IF;
END $$;

SELECT 'pristine' AS expected_guard_state, 'PASS' AS result;
