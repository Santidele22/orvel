-- Read-only, deterministic, allowlisted diagnostic. Output contains only
-- canonical function labels, canonical role labels, and booleans.
WITH expected(function_oid, function_label) AS (
  VALUES
    ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'mutation_trigger'),
    ('public.prevent_one_time_email_attempt_delete()'::regprocedure, 'delete_trigger'),
    ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'reserve_rpc'),
    ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, 'finalize_rpc')
), roles(role_oid, role_label) AS (
  VALUES
    (0::oid, 'PUBLIC'),
    ('anon'::regrole::oid, 'anon'),
    ('authenticated'::regrole::oid, 'authenticated'),
    ('service_role'::regrole::oid, 'service_role')
)
SELECT expected.function_label,
       roles.role_label,
       EXISTS (
         SELECT 1 FROM pg_proc function_definition,
              LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
         WHERE function_definition.oid = expected.function_oid
           AND privilege.grantee = roles.role_oid
           AND privilege.privilege_type = 'EXECUTE'
       ) AS direct_execute,
       CASE WHEN roles.role_oid = 0 THEN
         EXISTS (
           SELECT 1 FROM pg_proc function_definition,
                LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
           WHERE function_definition.oid = expected.function_oid
             AND privilege.grantee = 0
             AND privilege.privilege_type = 'EXECUTE'
         )
       ELSE has_function_privilege(roles.role_oid, expected.function_oid, 'EXECUTE') END AS effective_execute
FROM expected CROSS JOIN roles
ORDER BY expected.function_label, roles.role_label;

WITH roles(role_oid, role_label) AS (
  VALUES
    ('anon'::regrole::oid, 'anon'),
    ('authenticated'::regrole::oid, 'authenticated'),
    ('service_role'::regrole::oid, 'service_role')
)
SELECT roles.role_label,
       EXISTS (
         SELECT 1
         FROM pg_default_acl defaults
         JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace,
              LATERAL aclexplode(defaults.defaclacl) privilege
         WHERE namespace.nspname = 'public'
           AND defaults.defaclobjtype = 'f'
           AND privilege.grantee = roles.role_oid
           AND privilege.privilege_type = 'EXECUTE'
       ) AS applicable_default_execute
FROM roles
ORDER BY roles.role_label;
