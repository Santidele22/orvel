BEGIN;

-- Bound lock acquisition independently of operator/client settings. Five seconds
-- avoids an unbounded production wait; thirty seconds bounds the full small-table
-- migration while leaving ample time for validation and transactional rollback.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE reminder_generic_relevant_owners (
  owner_oid oid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO reminder_generic_relevant_owners (owner_oid)
SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
UNION SELECT proowner FROM pg_proc WHERE oid IN (
  'public.prevent_one_time_email_attempt_mutation()'::regprocedure,
  'public.prevent_one_time_email_attempt_delete()'::regprocedure,
  'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure,
  'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
UNION SELECT current_user::regrole::oid;

-- The preceding ACL migration commits independently. Refuse to create any
-- helper until its clean legacy ACL/default postcondition is established.
DO $acl_precondition$
DECLARE
BEGIN
  IF (SELECT count(*) FROM reminder_generic_relevant_owners) NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Generic migration found an unknown fourth relevant owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(function_oid, service_role_execute)
    WHERE has_function_privilege('anon', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('service_role', expected.function_oid, 'EXECUTE') <> expected.service_role_execute
  ) OR EXISTS (
    SELECT 1 FROM reminder_generic_relevant_owners owners
    CROSS JOIN LATERAL aclexplode(coalesce(
      (SELECT defaclacl FROM pg_default_acl WHERE defaclrole = owners.owner_oid AND defaclobjtype = 'f' AND defaclnamespace = 0),
      acldefault('f', owners.owner_oid))) effective_defaults
    WHERE effective_defaults.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND effective_defaults.privilege_type = 'EXECUTE'
    UNION ALL
    SELECT 1 FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole IN (SELECT owner_oid FROM reminder_generic_relevant_owners)
      AND defaults.defaclobjtype = 'f' AND defaults.defaclnamespace = 'public'::regnamespace
      AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Generic migration requires normalized legacy function ACLs and defaults';
  END IF;
END
$acl_precondition$;

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

-- CREATE OR REPLACE preserves existing ACLs. Reassert the exact callable
-- surface so this migration remains safe after any legacy/default ACL state.
REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.one_time_operational_email_contract() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_one_time_operational_email_attempt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) TO service_role;

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

  IF EXISTS (
    (SELECT owner_oid FROM reminder_generic_relevant_owners)
    EXCEPT
    (SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
     UNION SELECT proowner FROM pg_proc WHERE oid IN (
       'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
       'public.one_time_operational_email_contract()'::regprocedure, 'public.normalize_one_time_operational_email_attempt()'::regprocedure,
       'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
     UNION SELECT current_user::regrole::oid)
  ) OR EXISTS (
    (SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
     UNION SELECT proowner FROM pg_proc WHERE oid IN (
       'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
       'public.one_time_operational_email_contract()'::regprocedure, 'public.normalize_one_time_operational_email_attempt()'::regprocedure,
       'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
     UNION SELECT current_user::regrole::oid)
    EXCEPT SELECT owner_oid FROM reminder_generic_relevant_owners
  ) THEN
    RAISE EXCEPTION 'Generic migration relevant owner set changed before commit';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.one_time_operational_email_contract()'::regprocedure, false),
      ('public.normalize_one_time_operational_email_attempt()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(function_oid, service_role_execute)
    WHERE EXISTS (
      SELECT 1 FROM pg_proc function_definition,
        LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
      WHERE function_definition.oid = expected.function_oid
        AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
        AND privilege.privilege_type = 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM pg_proc function_definition,
          LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
        WHERE function_definition.oid = expected.function_oid
          AND privilege.grantee = 'service_role'::regrole
          AND privilege.privilege_type = 'EXECUTE'
          AND NOT privilege.is_grantable) <> expected.service_role_execute
      OR EXISTS (
        SELECT 1 FROM pg_proc function_definition,
          LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
        WHERE function_definition.oid = expected.function_oid
          AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
          AND privilege.privilege_type = 'EXECUTE'
          AND privilege.is_grantable)
      OR has_function_privilege('anon', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('service_role', expected.function_oid, 'EXECUTE') <> expected.service_role_execute
  ) THEN
    RAISE EXCEPTION 'Generic migration final function ACL matrix failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM reminder_generic_relevant_owners owners
    CROSS JOIN LATERAL aclexplode(coalesce(
      (SELECT defaclacl FROM pg_default_acl WHERE defaclrole = owners.owner_oid AND defaclobjtype = 'f' AND defaclnamespace = 0),
      acldefault('f', owners.owner_oid))) privilege
    WHERE privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND privilege.privilege_type = 'EXECUTE'
    UNION ALL
    SELECT 1 FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole IN (SELECT owner_oid FROM reminder_generic_relevant_owners)
      AND defaults.defaclobjtype = 'f' AND defaults.defaclnamespace = 'public'::regnamespace
      AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Generic migration final default ACL matrix failed';
  END IF;
END;
$$;

COMMIT;
