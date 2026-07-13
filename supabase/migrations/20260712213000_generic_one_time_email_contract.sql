BEGIN;

-- Bound lock acquisition independently of operator/client settings. Five seconds
-- avoids an unbounded production wait; thirty seconds bounds the full small-table
-- migration while leaving ample time for validation and transactional rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.one_time_operational_email_contract()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'lifecycle_key', 'one_time_operational_email:v2',
    'purpose', 'one_time_operational_email'
  );
$$;

REVOKE ALL ON FUNCTION public.one_time_operational_email_contract() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.one_time_operational_email_contract() FROM anon;
REVOKE ALL ON FUNCTION public.one_time_operational_email_contract() FROM authenticated;
REVOKE ALL ON FUNCTION public.one_time_operational_email_contract() FROM service_role;

CREATE FUNCTION public.normalize_one_time_operational_email_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
BEGIN
  NEW.lifecycle_key := v_contract->>'lifecycle_key';
  NEW.purpose := v_contract->>'purpose';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_one_time_operational_email_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_one_time_operational_email_attempt() FROM anon;
REVOKE ALL ON FUNCTION public.normalize_one_time_operational_email_attempt() FROM authenticated;
REVOKE ALL ON FUNCTION public.normalize_one_time_operational_email_attempt() FROM service_role;

LOCK TABLE public.one_time_email_attempts IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_row_count bigint;
  v_invalid_count bigint;
BEGIN
  SELECT count(*) INTO v_row_count
  FROM public.one_time_email_attempts;

  IF v_row_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'generic one-time email migration found unexpected rows';
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM public.one_time_email_attempts
  WHERE state <> 'reserved'
    OR finalized_at IS NOT NULL;

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'generic one-time email migration refuses terminal state';
  END IF;
END;
$$;

DROP TRIGGER one_time_email_attempts_immutable_update
  ON public.one_time_email_attempts;

ALTER TABLE public.one_time_email_attempts
  DROP CONSTRAINT one_time_email_attempts_purpose_check;

UPDATE public.one_time_email_attempts
SET lifecycle_key = public.one_time_operational_email_contract()->>'lifecycle_key',
    purpose = public.one_time_operational_email_contract()->>'purpose';

ALTER TABLE public.one_time_email_attempts
  ADD CONSTRAINT one_time_email_attempts_purpose_check
  CHECK (purpose = public.one_time_operational_email_contract()->>'purpose');

CREATE TRIGGER one_time_email_attempts_immutable_update
BEFORE UPDATE ON public.one_time_email_attempts
FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_mutation();

CREATE TRIGGER one_time_email_attempts_normalize_insert
BEFORE INSERT ON public.one_time_email_attempts
FOR EACH ROW EXECUTE FUNCTION public.normalize_one_time_operational_email_attempt();

CREATE OR REPLACE FUNCTION public.reserve_trial_user_activation_reminder_attempt()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
  VALUES (v_contract->>'lifecycle_key', v_contract->>'purpose')
  ON CONFLICT (lifecycle_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF coalesce(v_inserted, false) THEN
    RETURN 'reserved';
  END IF;

  RETURN 'already_consumed';
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_trial_user_activation_reminder_attempt(p_state text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
  v_updated boolean := false;
BEGIN
  IF p_state IS NULL
    OR p_state NOT IN ('sent', 'rejected', 'ambiguous')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid one-time email outcome';
  END IF;

  UPDATE public.one_time_email_attempts
  SET state = p_state, finalized_at = clock_timestamp()
  WHERE lifecycle_key = v_contract->>'lifecycle_key'
    AND state = 'reserved'
  RETURNING true INTO v_updated;

  RETURN coalesce(v_updated, false);
END;
$$;

DO $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
  v_invalid_count bigint;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM public.one_time_email_attempts
  WHERE lifecycle_key <> v_contract->>'lifecycle_key'
    OR purpose <> v_contract->>'purpose'
    OR state <> 'reserved'
    OR finalized_at IS NOT NULL;

  IF v_invalid_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'generic one-time email migration postcondition failed';
  END IF;
END;
$$;

COMMIT;
