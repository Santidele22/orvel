BEGIN;

CREATE TABLE public.one_time_email_attempts (
  lifecycle_key text PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose = 'trial_user_activation_reminder'),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'sent', 'rejected', 'ambiguous')),
  attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finalized_at timestamptz,
  CHECK (
    (state = 'reserved' AND finalized_at IS NULL)
    OR (state <> 'reserved' AND finalized_at IS NOT NULL)
  )
);

ALTER TABLE public.one_time_email_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.one_time_email_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.one_time_email_attempts FROM anon;
REVOKE ALL ON TABLE public.one_time_email_attempts FROM authenticated;
REVOKE ALL ON TABLE public.one_time_email_attempts FROM service_role;

CREATE FUNCTION public.prevent_one_time_email_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lifecycle_key IS DISTINCT FROM OLD.lifecycle_key
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.attempted_at IS DISTINCT FROM OLD.attempted_at
    OR OLD.state <> 'reserved'
    OR NEW.state NOT IN ('sent', 'rejected', 'ambiguous')
    OR NEW.finalized_at IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'one_time_email_attempt is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_one_time_email_attempt_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'one_time_email_attempt cannot be deleted';
END;
$$;

CREATE TRIGGER one_time_email_attempts_immutable_update
BEFORE UPDATE ON public.one_time_email_attempts
FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_mutation();

CREATE TRIGGER one_time_email_attempts_immutable_delete
BEFORE DELETE ON public.one_time_email_attempts
FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_delete();

CREATE FUNCTION public.reserve_trial_user_activation_reminder_attempt()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lifecycle_key constant text := 'trial_user_activation_reminder:masajes-mg-10b0c244:v1';
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
  VALUES (v_lifecycle_key, 'trial_user_activation_reminder')
  ON CONFLICT (lifecycle_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF coalesce(v_inserted, false) THEN
    RETURN 'reserved';
  END IF;

  RETURN 'already_consumed';
END;
$$;

CREATE FUNCTION public.finalize_trial_user_activation_reminder_attempt(p_state text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lifecycle_key constant text := 'trial_user_activation_reminder:masajes-mg-10b0c244:v1';
  v_updated boolean := false;
BEGIN
  IF p_state IS NULL
    OR p_state NOT IN ('sent', 'rejected', 'ambiguous')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'invalid one-time reminder outcome';
  END IF;

  UPDATE public.one_time_email_attempts
  SET state = p_state, finalized_at = clock_timestamp()
  WHERE lifecycle_key = v_lifecycle_key
    AND state = 'reserved'
  RETURNING true INTO v_updated;

  RETURN coalesce(v_updated, false);
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) TO service_role;

COMMIT;
