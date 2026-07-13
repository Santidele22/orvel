BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $acl$
DECLARE
  v_table_owner oid;
  v_function_owner name;
BEGIN
  SELECT relowner INTO v_table_owner
  FROM pg_class
  WHERE oid = 'public.one_time_email_attempts'::regclass;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(function_oid, security_definer)
    JOIN pg_proc function_definition ON function_definition.oid = expected.function_oid
    WHERE function_definition.proowner <> v_table_owner
      OR function_definition.prosecdef <> expected.security_definer
  ) THEN
    RAISE EXCEPTION 'Legacy reminder function owner or security drift detected';
  END IF;

  SELECT rolname INTO v_function_owner FROM pg_roles WHERE oid = v_table_owner;
  IF v_function_owner IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (oid = v_table_owner OR rolsuper))
  THEN
    RAISE EXCEPTION 'Migration role cannot safely alter reminder function owner defaults';
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role',
    v_function_owner
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role',
    v_function_owner
  );
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
  v_function_owner oid := (SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass);
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT privilege.* FROM aclexplode(coalesce(
        (SELECT defaclacl FROM pg_default_acl WHERE defaclrole = v_function_owner AND defaclobjtype = 'f' AND defaclnamespace = 0),
        acldefault('f', v_function_owner)
      )) privilege
      UNION ALL
      SELECT privilege.* FROM pg_default_acl defaults,
           LATERAL aclexplode(defaults.defaclacl) privilege
      WHERE defaults.defaclrole = v_function_owner AND defaults.defaclobjtype = 'f'
        AND defaults.defaclnamespace = 'public'::regnamespace
    ) effective_defaults
    WHERE effective_defaults.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND effective_defaults.privilege_type = 'EXECUTE'
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
