-- Read-only gate for the production state after 20260710210000 and before
-- 20260712213000. This file must never reserve or finalize an attempt.
DO $preflight$
DECLARE
  v_row_count bigint;
  v_invalid_count bigint;
  v_column_count integer;
  v_constraint_count integer;
  v_trigger_count integer;
BEGIN
  IF to_regclass('public.one_time_email_attempts') IS NULL THEN
    RAISE EXCEPTION 'Legacy reminder table is absent';
  END IF;

  IF to_regprocedure('public.one_time_operational_email_contract()') IS NOT NULL
    OR to_regprocedure('public.normalize_one_time_operational_email_attempt()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Generic one-time email contract is already present';
  END IF;

  SELECT count(*) INTO v_column_count
  FROM pg_attribute
  WHERE attrelid = 'public.one_time_email_attempts'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND (attname, format_type(atttypid, atttypmod), attnotnull) IN (
      ('lifecycle_key', 'text', true),
      ('purpose', 'text', true),
      ('state', 'text', true),
      ('attempted_at', 'timestamp with time zone', true),
      ('finalized_at', 'timestamp with time zone', false)
    );
  IF v_column_count <> 5 OR (
    SELECT count(*) FROM pg_attribute
    WHERE attrelid = 'public.one_time_email_attempts'::regclass
      AND attnum > 0 AND NOT attisdropped
  ) <> 5 THEN
    RAISE EXCEPTION 'Legacy reminder table schema drift detected';
  END IF;

  IF to_regprocedure('public.prevent_one_time_email_attempt_mutation()') IS NULL
    OR to_regprocedure('public.prevent_one_time_email_attempt_delete()') IS NULL
    OR to_regprocedure('public.reserve_trial_user_activation_reminder_attempt()') IS NULL
    OR to_regprocedure('public.finalize_trial_user_activation_reminder_attempt(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Legacy reminder function drift detected';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.one_time_email_attempts'::regclass
    AND NOT tgisinternal
    AND (tgname, tgfoid) IN (
      ('one_time_email_attempts_immutable_update', 'public.prevent_one_time_email_attempt_mutation()'::regprocedure),
      ('one_time_email_attempts_immutable_delete', 'public.prevent_one_time_email_attempt_delete()'::regprocedure)
    );
  IF v_trigger_count <> 2 OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.one_time_email_attempts'::regclass
      AND NOT tgisinternal
      AND tgname NOT IN ('one_time_email_attempts_immutable_update', 'one_time_email_attempts_immutable_delete')
  ) THEN
    RAISE EXCEPTION 'Legacy reminder trigger drift detected';
  END IF;

  SELECT count(*) INTO v_constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.one_time_email_attempts'::regclass
    AND conname IN (
      'one_time_email_attempts_pkey',
      'one_time_email_attempts_purpose_check',
      'one_time_email_attempts_state_check',
      'one_time_email_attempts_check'
    );
  IF v_constraint_count <> 4
    OR pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conrelid = 'public.one_time_email_attempts'::regclass AND conname = 'one_time_email_attempts_purpose_check'))
       NOT LIKE '%trial_user_activation_reminder%'
  THEN
    RAISE EXCEPTION 'Legacy reminder constraint drift detected';
  END IF;

  SELECT count(*), count(*) FILTER (
    WHERE state <> 'reserved' OR finalized_at IS NOT NULL
  ) INTO v_row_count, v_invalid_count
  FROM public.one_time_email_attempts;

  IF v_row_count > 1 THEN
    RAISE EXCEPTION 'Legacy reminder state has multiple rows';
  END IF;
  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION 'Legacy reminder state is terminal or inconsistent';
  END IF;
END
$preflight$;

SELECT 'legacy-applied' AS expected_guard_state, 'PASS' AS result;
