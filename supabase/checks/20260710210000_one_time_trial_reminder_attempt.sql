-- Rollback-safe PostgreSQL contract for an isolated ephemeral database only.
-- The concurrency harness creates, migrates, checks, and drops that database.
-- Expected final row: one_time_trial_reminder_attempt | PASS

BEGIN;

DO $$
DECLARE
  v_outbox_count bigint;
  v_result text;
BEGIN
  BEGIN
    PERFORM public.finalize_trial_user_activation_reminder_attempt(NULL);
    RAISE EXCEPTION 'Expected NULL finalization state rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    PERFORM public.finalize_trial_user_activation_reminder_attempt('reserved');
    RAISE EXCEPTION 'Expected invalid finalization state rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  SELECT count(*) INTO v_outbox_count FROM public.notification_email_outbox;

  v_result := public.reserve_trial_user_activation_reminder_attempt();
  IF v_result <> 'reserved' THEN
    RAISE EXCEPTION 'Expected first reservation, got %', v_result;
  END IF;

  v_result := public.reserve_trial_user_activation_reminder_attempt();
  IF v_result <> 'already_consumed' THEN
    RAISE EXCEPTION 'Expected repeated reservation to be consumed, got %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.one_time_email_attempts
    WHERE state = 'reserved'
      AND finalized_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected durable reserved evidence';
  END IF;

  IF NOT public.finalize_trial_user_activation_reminder_attempt('sent') THEN
    RAISE EXCEPTION 'Expected first finalization to persist';
  END IF;

  IF public.finalize_trial_user_activation_reminder_attempt('ambiguous') THEN
    RAISE EXCEPTION 'Expected terminal state to reject later finalization';
  END IF;

  BEGIN
    UPDATE public.one_time_email_attempts SET lifecycle_key = 'replacement';
    RAISE EXCEPTION 'Expected identity mutation rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.one_time_email_attempts;
    RAISE EXCEPTION 'Expected deletion rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  IF (SELECT count(*) FROM public.notification_email_outbox) <> v_outbox_count THEN
    RAISE EXCEPTION 'One-time reminder guard changed the general outbox';
  END IF;
END $$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
BEGIN
  BEGIN
    UPDATE public.one_time_email_attempts SET state = 'rejected';
    RAISE EXCEPTION 'Expected service_role direct DML denial';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;
SELECT 'one_time_trial_reminder_attempt' AS check_name, 'PASS' AS result;
ROLLBACK;
