-- Read-only, deterministic, allowlisted diagnostic. Output contains only
-- canonical function labels, canonical role labels, and booleans.
WITH expected(signature, function_label) AS (
  VALUES
    ('public.prevent_one_time_email_attempt_mutation()', 'mutation_trigger'),
    ('public.prevent_one_time_email_attempt_delete()', 'delete_trigger'),
    ('public.reserve_trial_user_activation_reminder_attempt()', 'reserve_rpc'),
    ('public.finalize_trial_user_activation_reminder_attempt(text)', 'finalize_rpc'),
    ('public.one_time_operational_email_contract()', 'contract_helper'),
    ('public.normalize_one_time_operational_email_attempt()', 'normalize_trigger')
), resolved AS (
  SELECT to_regprocedure(signature) AS function_oid, function_label FROM expected
), roles(role_oid, role_label) AS (
  VALUES
    (0::oid, 'PUBLIC'),
    ('anon'::regrole::oid, 'anon'),
    ('authenticated'::regrole::oid, 'authenticated'),
    ('service_role'::regrole::oid, 'service_role')
)
SELECT resolved.function_label,
       roles.role_label,
       EXISTS (
         SELECT 1 FROM pg_proc function_definition,
              LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
         WHERE function_definition.oid = resolved.function_oid
           AND privilege.grantee = roles.role_oid
           AND privilege.privilege_type = 'EXECUTE'
       ) AS direct_execute,
       CASE WHEN roles.role_oid = 0 THEN
         EXISTS (
           SELECT 1 FROM pg_proc function_definition,
                LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
           WHERE function_definition.oid = resolved.function_oid
             AND privilege.grantee = 0
             AND privilege.privilege_type = 'EXECUTE'
         )
       ELSE coalesce(has_function_privilege(roles.role_oid, resolved.function_oid, 'EXECUTE'), false) END AS effective_execute
FROM resolved CROSS JOIN roles
ORDER BY resolved.function_label, roles.role_label;

WITH relevant_owners(owner_oid, owner_category) AS (
  SELECT owner_oid,
         CASE WHEN owner_oid = (SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass)
              THEN 'table_owner'
              WHEN owner_oid = current_user::regrole::oid THEN 'migration_actor'
              ELSE 'legacy_function_owner' END
  FROM (
    SELECT relowner AS owner_oid FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass
    UNION SELECT proowner FROM pg_proc WHERE oid IN (
      'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
      'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
    UNION SELECT current_user::regrole::oid
  ) owners
), roles(role_oid, role_label) AS (
  VALUES
    ('anon'::regrole::oid, 'anon'),
    ('authenticated'::regrole::oid, 'authenticated'),
    ('service_role'::regrole::oid, 'service_role')
)
SELECT relevant_owners.owner_category,
       roles.role_label,
       EXISTS (
         SELECT 1
         FROM pg_default_acl defaults
         JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace,
              LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole = relevant_owners.owner_oid
           AND namespace.nspname = 'public'
           AND defaults.defaclobjtype = 'f'
           AND privilege.grantee = roles.role_oid
           AND privilege.privilege_type = 'EXECUTE'
       ) OR EXISTS (
         SELECT 1
         FROM pg_default_acl defaults,
              LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole = relevant_owners.owner_oid
           AND defaults.defaclnamespace = 0
           AND defaults.defaclobjtype = 'f'
           AND privilege.grantee = roles.role_oid
           AND privilege.privilege_type = 'EXECUTE'
       ) OR EXISTS (
         SELECT 1 FROM aclexplode(coalesce(
           (SELECT defaclacl FROM pg_default_acl WHERE defaclrole = relevant_owners.owner_oid AND defaclobjtype = 'f' AND defaclnamespace = 0),
           acldefault('f', relevant_owners.owner_oid))) privilege
         WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
       ) AS applicable_default_execute
FROM relevant_owners CROSS JOIN roles
ORDER BY relevant_owners.owner_category, roles.role_label;
