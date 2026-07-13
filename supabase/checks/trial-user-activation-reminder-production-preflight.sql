-- Read-only pristine/present regression dispatcher. Production operators use
-- the explicitly named checked-in stage files through the operation script.
\set ON_ERROR_STOP on

SELECT :'expected_guard_state' IN ('pristine', 'present') AS valid_expected_state \gset
\if :valid_expected_state
\else
  \echo 'Invalid expected_guard_state'
  SELECT 1 / 0;
\endif

SELECT to_regclass('public.one_time_email_attempts') IS NOT NULL AS guard_exists \gset
SELECT (:'expected_guard_state' = 'present') = :'guard_exists'::boolean AS guard_matches \gset
\if :guard_matches
\else
  \echo 'Migration/table state mismatch'
  SELECT 1 / 0;
\endif

\if :guard_exists
  SELECT $dynamic$
    DO $preflight$
    DECLARE
      v_contract jsonb := public.one_time_operational_email_contract();
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.one_time_email_attempts
        WHERE lifecycle_key = v_contract->>'lifecycle_key'
          AND purpose = v_contract->>'purpose'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Lifecycle attempt already exists; operation is terminal';
      END IF;
    END
    $preflight$;
  $dynamic$ \gexec
\endif

SELECT :'expected_guard_state' AS expected_guard_state, 'PASS' AS result;
