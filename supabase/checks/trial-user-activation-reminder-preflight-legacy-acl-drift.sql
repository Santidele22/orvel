-- Exact read-only gate for the redacted production diagnosis: historical
-- schema present, generic helpers absent, and direct/default EXECUTE drift on
-- the four legacy functions for anon, authenticated, and service_role.
DO $preflight$
DECLARE
  v_table regclass := to_regclass('public.one_time_email_attempts');
  v_owner oid;
  v_row_count bigint;
  v_invalid_count bigint;
BEGIN
  IF v_table IS NULL THEN RAISE EXCEPTION 'Legacy reminder table is absent'; END IF;
  SELECT relowner INTO v_owner FROM pg_class WHERE oid = v_table;

  IF to_regprocedure('public.one_time_operational_email_contract()') IS NOT NULL
    OR to_regprocedure('public.normalize_one_time_operational_email_attempt()') IS NOT NULL
  THEN RAISE EXCEPTION 'Generic one-time email artifacts are already present'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(attname, format_type(atttypid, atttypmod), attnotnull,
         pg_get_expr(adbin, adrelid)) ORDER BY attnum)
      FROM pg_attribute LEFT JOIN pg_attrdef ON adrelid = attrelid AND adnum = attnum
      WHERE attrelid = v_table AND attnum > 0 AND NOT attisdropped) IS DISTINCT FROM
    '[["lifecycle_key","text",true,null],["purpose","text",true,null],["state","text",true,"''reserved''::text"],["attempted_at","timestamp with time zone",true,"clock_timestamp()"],["finalized_at","timestamp with time zone",false,null]]'::jsonb
  THEN RAISE EXCEPTION 'Legacy reminder column drift detected'; END IF;

  IF (SELECT jsonb_object_agg(conname, pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = v_table AND contype IN ('p', 'c'))
     IS DISTINCT FROM jsonb_build_object(
       'one_time_email_attempts_pkey', 'PRIMARY KEY (lifecycle_key)',
       'one_time_email_attempts_purpose_check', 'CHECK ((purpose = ''trial_user_activation_reminder''::text))',
       'one_time_email_attempts_state_check', 'CHECK ((state = ANY (ARRAY[''reserved''::text, ''sent''::text, ''rejected''::text, ''ambiguous''::text])))',
       'one_time_email_attempts_check', 'CHECK ((((state = ''reserved''::text) AND (finalized_at IS NULL)) OR ((state <> ''reserved''::text) AND (finalized_at IS NOT NULL))))'
     )
  THEN RAISE EXCEPTION 'Legacy reminder constraint drift detected'; END IF;

  IF NOT (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = v_table)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table)
    OR EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
               WHERE c.oid = v_table AND acl.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
  THEN RAISE EXCEPTION 'Legacy reminder table security drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false, 'trigger'::regtype, ARRAY['one_time_email_attemptisimmutable']),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false, 'trigger'::regtype, ARRAY['one_time_email_attemptcannotbedeleted']),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true, 'text'::regtype, ARRAY['trial_user_activation_reminder:masajes-mg-10b0c244:v1','already_consumed']),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true, 'boolean'::regtype, ARRAY['trial_user_activation_reminder:masajes-mg-10b0c244:v1','p_stateNOTIN(''sent'',''rejected'',''ambiguous'')'])
    ) expected(function_oid, security_definer, return_type, snippets)
    JOIN pg_proc function_definition ON function_definition.oid = expected.function_oid
    JOIN pg_language language_definition ON language_definition.oid = function_definition.prolang
    WHERE function_definition.prosecdef <> expected.security_definer
      OR language_definition.lanname <> 'plpgsql'
      OR function_definition.provolatile <> 'v'
      OR function_definition.prorettype <> expected.return_type
      OR function_definition.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
      OR EXISTS (SELECT 1 FROM unnest(expected.snippets) snippet
                 WHERE strpos(lower(regexp_replace(function_definition.prosrc, '\s+', '', 'g')), lower(snippet)) = 0)
  ) THEN RAISE EXCEPTION 'Legacy reminder function owner or security drift detected'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(tgname, tgenabled, tgtype, tgfoid::regprocedure::text) ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid = v_table AND NOT tgisinternal) IS DISTINCT FROM
    '[["one_time_email_attempts_immutable_delete","O",11,"prevent_one_time_email_attempt_delete()"],["one_time_email_attempts_immutable_update","O",19,"prevent_one_time_email_attempt_mutation()"]]'::jsonb
  THEN RAISE EXCEPTION 'Legacy reminder trigger drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
    ) expected(function_oid)
    WHERE EXISTS (
      SELECT 1
      FROM pg_proc function_definition,
           LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
      WHERE function_definition.oid = expected.function_oid
        AND privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    )
      OR EXISTS (
        SELECT required_role
        FROM (VALUES ('anon'::regrole), ('authenticated'::regrole), ('service_role'::regrole)) role(required_role)
        WHERE NOT EXISTS (
          SELECT 1
          FROM pg_proc function_definition,
               LATERAL aclexplode(coalesce(function_definition.proacl, acldefault('f', function_definition.proowner))) privilege
          WHERE function_definition.oid = expected.function_oid
            AND privilege.grantee = role.required_role
            AND privilege.privilege_type = 'EXECUTE'
            AND NOT privilege.is_grantable
        )
          OR NOT has_function_privilege(role.required_role, expected.function_oid, 'EXECUTE')
      )
  ) THEN RAISE EXCEPTION 'Legacy reminder ACL does not match diagnosed production drift'; END IF;

  IF EXISTS (
    WITH owners(owner_oid) AS (
      SELECT v_owner UNION SELECT proowner FROM pg_proc WHERE oid IN (
        'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
        'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure)
      UNION SELECT current_user::regrole::oid
    )
    SELECT 1 FROM owners
    WHERE EXISTS (SELECT 1 FROM pg_default_acl WHERE defaclrole = owners.owner_oid AND defaclobjtype = 'f' AND defaclnamespace = 0)
      OR (SELECT count(*) FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole = owners.owner_oid AND defaults.defaclobjtype = 'f'
            AND defaults.defaclnamespace = 'public'::regnamespace
            AND privilege.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
            AND privilege.privilege_type = 'EXECUTE' AND NOT privilege.is_grantable) <> 3
      OR EXISTS (SELECT 1 FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege
          WHERE defaults.defaclrole = owners.owner_oid AND defaults.defaclobjtype = 'f'
            AND defaults.defaclnamespace = 'public'::regnamespace
            AND privilege.privilege_type = 'EXECUTE'
            AND (privilege.grantee = 0 OR privilege.is_grantable
              OR privilege.grantee NOT IN (owners.owner_oid, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)))
  ) THEN RAISE EXCEPTION 'Legacy reminder defaults do not match diagnosed production drift'; END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'reserved' OR finalized_at IS NOT NULL)
  INTO v_row_count, v_invalid_count FROM public.one_time_email_attempts;
  IF v_row_count > 1 OR v_invalid_count <> 0
  THEN RAISE EXCEPTION 'Legacy reminder durable state is unsafe'; END IF;
END
$preflight$;

SELECT 'legacy-acl-drift' AS expected_guard_state, 'PASS' AS result;
