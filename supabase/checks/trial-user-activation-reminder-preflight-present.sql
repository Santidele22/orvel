DO $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
  v_attempt_exists boolean;
BEGIN
  IF to_regclass('public.one_time_email_attempts') IS NULL THEN
    RAISE EXCEPTION 'Migration/table state mismatch';
  END IF;
  EXECUTE $query$
    SELECT EXISTS (
      SELECT 1 FROM public.one_time_email_attempts
      WHERE lifecycle_key = $1
        AND purpose = $2
    )
  $query$ INTO v_attempt_exists
    USING v_contract->>'lifecycle_key', v_contract->>'purpose';
  IF v_attempt_exists THEN
    RAISE EXCEPTION 'Lifecycle attempt already exists; operation is terminal';
  END IF;
END $$;

SELECT 'present' AS expected_guard_state, 'PASS' AS result;
