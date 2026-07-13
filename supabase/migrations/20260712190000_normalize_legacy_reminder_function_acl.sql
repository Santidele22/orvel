BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $acl$
DECLARE
  v_owner record;
  v_owner_count integer;
BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(function_oid, security_definer)
    JOIN pg_proc function_definition ON function_definition.oid = expected.function_oid
    WHERE function_definition.prosecdef <> expected.security_definer) THEN
    RAISE EXCEPTION 'Legacy reminder function owner or security drift detected';
  END IF;

  SELECT count(*) INTO v_owner_count FROM (
    SELECT relowner AS owner_oid FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
    UNION
    SELECT proowner FROM pg_proc WHERE oid IN (
      'public.prevent_one_time_email_attempt_mutation()'::regprocedure,
      'public.prevent_one_time_email_attempt_delete()'::regprocedure,
      'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure,
      'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
  ) owners;
  IF v_owner_count NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'Legacy reminder owner set does not match diagnosed production shape';
  END IF;

  FOR v_owner IN
    SELECT role_definition.oid, role_definition.rolname
    FROM pg_roles role_definition
    WHERE role_definition.oid IN (
      SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
      UNION
      SELECT proowner FROM pg_proc WHERE oid IN (
        'public.prevent_one_time_email_attempt_mutation()'::regprocedure,
        'public.prevent_one_time_email_attempt_delete()'::regprocedure,
        'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure,
        'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure))
    ORDER BY role_definition.oid
  LOOP
    IF NOT pg_has_role(current_user, v_owner.oid, 'MEMBER')
      AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
    THEN RAISE EXCEPTION 'Migration role cannot safely alter every reminder owner default'; END IF;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role', v_owner.rolname);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role', v_owner.rolname);
  END LOOP;
END
$acl$;

REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_one_time_email_attempt_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) TO service_role;

DO $acl$
DECLARE
BEGIN
  IF EXISTS (
    WITH owners(owner_oid) AS (
      SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
      UNION SELECT proowner FROM pg_proc WHERE oid IN (
        'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
        'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
    )
    SELECT 1 FROM owners CROSS JOIN LATERAL aclexplode(coalesce(
      (SELECT defaclacl FROM pg_default_acl WHERE defaclrole = owners.owner_oid AND defaclobjtype = 'f' AND defaclnamespace = 0),
      acldefault('f', owners.owner_oid))) effective_defaults
    WHERE effective_defaults.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND effective_defaults.privilege_type = 'EXECUTE'
    UNION ALL
    SELECT 1 FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege
    WHERE defaults.defaclrole IN (
      SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
      UNION SELECT proowner FROM pg_proc WHERE oid IN (
        'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
        'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure))
      AND defaults.defaclobjtype = 'f' AND defaults.defaclnamespace = 'public'::regnamespace
      AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Legacy reminder default function ACL normalization failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(function_oid, service_role_execute)
    WHERE EXISTS (
      SELECT 1
      FROM pg_proc function_definition,
           LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
      WHERE function_definition.oid = expected.function_oid
        AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
    )
      OR EXISTS (
        SELECT 1
        FROM pg_proc function_definition,
             LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
        WHERE function_definition.oid = expected.function_oid
          AND privilege.grantee = 'service_role'::regrole
          AND privilege.privilege_type = 'EXECUTE'
          AND NOT privilege.is_grantable
      ) <> expected.service_role_execute
      OR EXISTS (
        SELECT 1
        FROM pg_proc function_definition,
             LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
        WHERE function_definition.oid = expected.function_oid
          AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
          AND privilege.is_grantable
      )
      OR has_function_privilege('anon', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('authenticated', expected.function_oid, 'EXECUTE')
      OR has_function_privilege('service_role', expected.function_oid, 'EXECUTE') <> expected.service_role_execute
  ) THEN
    RAISE EXCEPTION 'Legacy reminder function ACL normalization failed';
  END IF;
END
$acl$;

COMMIT;
