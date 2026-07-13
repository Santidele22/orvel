-- Exact read-only gate after 20260710210000 and before 20260712213000.
DO $preflight$
DECLARE
  v_table regclass := to_regclass('public.one_time_email_attempts');
  v_row_count bigint;
  v_invalid_count bigint;
BEGIN
  IF v_table IS NULL THEN RAISE EXCEPTION 'Legacy reminder table is absent'; END IF;

  IF to_regprocedure('public.one_time_operational_email_contract()') IS NOT NULL
    OR to_regprocedure('public.normalize_one_time_operational_email_attempt()') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = v_table AND tgname = 'one_time_email_attempts_normalize_insert')
  THEN RAISE EXCEPTION 'Generic one-time email artifacts are already present'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(attname, format_type(atttypid, atttypmod), attnotnull,
         pg_get_expr(adbin, adrelid)) ORDER BY attnum)
      FROM pg_attribute LEFT JOIN pg_attrdef ON adrelid = attrelid AND adnum = attnum
      WHERE attrelid = v_table AND attnum > 0 AND NOT attisdropped) IS DISTINCT FROM
    '[
      ["lifecycle_key", "text", true, null],
      ["purpose", "text", true, null],
      ["state", "text", true, "''reserved''::text"],
      ["attempted_at", "timestamp with time zone", true, "clock_timestamp()"],
      ["finalized_at", "timestamp with time zone", false, null]
    ]'::jsonb
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
  THEN RAISE EXCEPTION 'Legacy reminder RLS, policy, or table privilege drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false, 'v', 'trigger'::regtype,
       ARRAY['new.lifecycle_keyisdistinctfromold.lifecycle_key','old.state<>''reserved''','new.stateNOTIN(''sent'',''rejected'',''ambiguous'')','one_time_email_attemptisimmutable']),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false, 'v', 'trigger'::regtype,
       ARRAY['one_time_email_attemptcannotbedeleted']),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true, 'v', 'text'::regtype,
       ARRAY['trial_user_activation_reminder:masajes-mg-10b0c244:v1','ONCONFLICT(lifecycle_key)DONOTHING','already_consumed']),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true, 'v', 'boolean'::regtype,
       ARRAY['trial_user_activation_reminder:masajes-mg-10b0c244:v1','p_stateNOTIN(''sent'',''rejected'',''ambiguous'')','ANDstate=''reserved'''])
    ) expected(oid, security_definer, volatility, return_type, snippets)
    LEFT JOIN pg_proc p ON p.oid = expected.oid
    LEFT JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid IS NULL OR l.lanname <> 'plpgsql' OR p.prosecdef <> expected.security_definer
      OR p.provolatile <> expected.volatility::"char" OR p.prorettype <> expected.return_type
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
      OR EXISTS (SELECT 1 FROM unnest(expected.snippets) snippet
                 WHERE strpos(lower(regexp_replace(p.prosrc, '\s+', '', 'g')), lower(snippet)) = 0)
  ) THEN RAISE EXCEPTION 'Legacy reminder function definition drift detected'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(tgname, tgenabled, tgtype, tgfoid::regprocedure::text) ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid = v_table AND NOT tgisinternal) IS DISTINCT FROM
    '[
      ["one_time_email_attempts_immutable_delete", "O", 11, "prevent_one_time_email_attempt_delete()"],
      ["one_time_email_attempts_immutable_update", "O", 19, "prevent_one_time_email_attempt_mutation()"]
    ]'::jsonb
  THEN RAISE EXCEPTION 'Legacy reminder trigger drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(oid, service_role_execute)
    WHERE EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                  WHERE p.oid = expected.oid AND acl.grantee = 0)
      OR has_function_privilege('anon', oid, 'EXECUTE')
      OR has_function_privilege('authenticated', oid, 'EXECUTE')
      OR has_function_privilege('service_role', oid, 'EXECUTE') <> service_role_execute
  ) THEN RAISE EXCEPTION 'Legacy reminder function privilege drift detected'; END IF;

  IF EXISTS (
    WITH owners(owner_oid) AS (
      SELECT relowner FROM pg_class WHERE oid = v_table
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
      SELECT relowner FROM pg_class WHERE oid = v_table
      UNION SELECT proowner FROM pg_proc WHERE oid IN (
        'public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure,
        'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure))
      AND defaults.defaclobjtype = 'f' AND defaults.defaclnamespace = 'public'::regnamespace
      AND privilege.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
      AND privilege.privilege_type = 'EXECUTE'
  ) THEN RAISE EXCEPTION 'Legacy reminder default function privilege drift detected'; END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'reserved' OR finalized_at IS NOT NULL)
  INTO v_row_count, v_invalid_count FROM public.one_time_email_attempts;
  IF v_row_count > 1 THEN RAISE EXCEPTION 'Legacy reminder state has multiple rows'; END IF;
  IF v_invalid_count <> 0 THEN RAISE EXCEPTION 'Legacy reminder state is terminal or inconsistent'; END IF;
END
$preflight$;

SELECT 'legacy-applied' AS expected_guard_state, 'PASS' AS result;
