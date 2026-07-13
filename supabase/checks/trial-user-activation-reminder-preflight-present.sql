-- Exact read-only gate after 20260712213000. Never reserves an attempt.
DO $preflight$
DECLARE
  v_table regclass := to_regclass('public.one_time_email_attempts');
  v_contract jsonb;
BEGIN
  IF v_table IS NULL THEN RAISE EXCEPTION 'Generic reminder table is absent'; END IF;
  IF to_regprocedure('public.one_time_operational_email_contract()') IS NULL
    OR to_regprocedure('public.normalize_one_time_operational_email_attempt()') IS NULL
  THEN RAISE EXCEPTION 'Generic one-time email helpers are absent'; END IF;

  v_contract := public.one_time_operational_email_contract();
  IF md5(v_contract::text) <> '4902909a9a560d428c0da6bf39f4dc89'
  THEN RAISE EXCEPTION 'Generic one-time email contract drift detected'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(attname, format_type(atttypid, atttypmod), attnotnull,
         pg_get_expr(adbin, adrelid)) ORDER BY attnum)
      FROM pg_attribute LEFT JOIN pg_attrdef ON adrelid = attrelid AND adnum = attnum
      WHERE attrelid = v_table AND attnum > 0 AND NOT attisdropped) IS DISTINCT FROM
    '[["lifecycle_key","text",true,null],["purpose","text",true,null],["state","text",true,"''reserved''::text"],["attempted_at","timestamp with time zone",true,"clock_timestamp()"],["finalized_at","timestamp with time zone",false,null]]'::jsonb
  THEN RAISE EXCEPTION 'Generic reminder column drift detected'; END IF;

  IF (SELECT jsonb_object_agg(conname, pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid = v_table AND contype IN ('p', 'c'))
     IS DISTINCT FROM jsonb_build_object(
       'one_time_email_attempts_pkey', 'PRIMARY KEY (lifecycle_key)',
       'one_time_email_attempts_purpose_check', 'CHECK ((purpose = (one_time_operational_email_contract() ->> ''purpose''::text)))',
       'one_time_email_attempts_state_check', 'CHECK ((state = ANY (ARRAY[''reserved''::text, ''sent''::text, ''rejected''::text, ''ambiguous''::text])))',
       'one_time_email_attempts_check', 'CHECK ((((state = ''reserved''::text) AND (finalized_at IS NULL)) OR ((state <> ''reserved''::text) AND (finalized_at IS NOT NULL))))'
     )
  THEN RAISE EXCEPTION 'Generic reminder constraint drift detected'; END IF;

  IF NOT (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = v_table)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table)
    OR EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
               WHERE c.oid = v_table AND acl.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))
  THEN RAISE EXCEPTION 'Generic reminder RLS, policy, or table privilege drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'plpgsql', false, 'v', 'u', 'trigger'::regtype,
       ARRAY['new.lifecycle_keyisdistinctfromold.lifecycle_key','old.state<>''reserved''','one_time_email_attemptisimmutable']),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, 'plpgsql', false, 'v', 'u', 'trigger'::regtype,
       ARRAY['one_time_email_attemptcannotbedeleted']),
      ('public.one_time_operational_email_contract()'::regprocedure, 'sql', false, 'i', 's', 'jsonb'::regtype,
       ARRAY['jsonb_build_object','lifecycle_key','purpose']),
      ('public.normalize_one_time_operational_email_attempt()'::regprocedure, 'plpgsql', false, 'v', 'u', 'trigger'::regtype,
       ARRAY['new.lifecycle_key:=v_contract->>''lifecycle_key''','new.purpose:=v_contract->>''purpose''']),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'plpgsql', true, 'v', 'u', 'text'::regtype,
       ARRAY['one_time_operational_email_contract()','onconflict(lifecycle_key)donothing','already_consumed']),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, 'plpgsql', true, 'v', 'u', 'boolean'::regtype,
       ARRAY['one_time_operational_email_contract()','p_statenotin(''sent'',''rejected'',''ambiguous'')','andstate=''reserved'''])
    ) expected(oid, language_name, security_definer, volatility, parallel_mode, return_type, snippets)
    LEFT JOIN pg_proc p ON p.oid = expected.oid LEFT JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid IS NULL OR l.lanname <> expected.language_name OR p.prosecdef <> expected.security_definer
      OR p.provolatile <> expected.volatility::"char" OR p.proparallel <> expected.parallel_mode::"char"
      OR p.prorettype <> expected.return_type OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
      OR EXISTS (SELECT 1 FROM unnest(expected.snippets) snippet
                 WHERE strpos(lower(regexp_replace(p.prosrc, '\s+', '', 'g')), lower(snippet)) = 0)
  ) THEN RAISE EXCEPTION 'Generic reminder function definition drift detected'; END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(tgname, tgenabled, tgtype, tgfoid::regprocedure::text) ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid = v_table AND NOT tgisinternal) IS DISTINCT FROM
    '[["one_time_email_attempts_immutable_delete","O",11,"prevent_one_time_email_attempt_delete()"],["one_time_email_attempts_immutable_update","O",19,"prevent_one_time_email_attempt_mutation()"],["one_time_email_attempts_normalize_insert","O",7,"normalize_one_time_operational_email_attempt()"]]'::jsonb
  THEN RAISE EXCEPTION 'Generic reminder trigger drift detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, false),
      ('public.prevent_one_time_email_attempt_delete()'::regprocedure, false),
      ('public.one_time_operational_email_contract()'::regprocedure, false),
      ('public.normalize_one_time_operational_email_attempt()'::regprocedure, false),
      ('public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, true),
      ('public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure, true)
    ) expected(oid, service_role_execute)
    WHERE EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                  WHERE p.oid = expected.oid AND acl.grantee = 0)
      OR has_function_privilege('anon', oid, 'EXECUTE')
      OR has_function_privilege('authenticated', oid, 'EXECUTE')
      OR has_function_privilege('service_role', oid, 'EXECUTE') <> service_role_execute
  ) THEN RAISE EXCEPTION 'Generic reminder function privilege drift detected'; END IF;

  IF EXISTS (SELECT 1 FROM public.one_time_email_attempts)
  THEN RAISE EXCEPTION 'Lifecycle attempt already exists; operation is terminal'; END IF;
END
$preflight$;

SELECT 'present' AS expected_guard_state, 'PASS' AS result;
