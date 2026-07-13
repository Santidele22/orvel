#!/usr/bin/env bash
set -euo pipefail

database_prefix="orvel_reminder_acl_${$}"
databases=()
cleanup() {
  local database
  for database in "${databases[@]}"; do dropdb --if-exists --force "$database" >/dev/null 2>&1 || true; done
  psql -v ON_ERROR_STOP=1 -d "$PGDATABASE" >/dev/null 2>&1 <<'SQL' || true
REVOKE inherited_executor FROM anon;
DROP ROLE IF EXISTS inherited_executor;
DROP ROLE IF EXISTS unauthorized_actor;
DROP ROLE IF EXISTS migration_actor;
DROP ROLE IF EXISTS table_owner;
DROP ROLE IF EXISTS function_owner_four;
DROP ROLE IF EXISTS function_owner_three;
DROP ROLE IF EXISTS function_owner_two;
DROP ROLE IF EXISTS function_owner_one;
DROP ROLE IF EXISTS arbitrary_owner;
DROP ROLE IF EXISTS drift_owner;
DROP ROLE IF EXISTS anon;
DROP ROLE IF EXISTS authenticated;
DROP ROLE IF EXISTS service_role;
SQL
}
trap cleanup EXIT

psql -v ON_ERROR_STOP=1 -d "$PGDATABASE" >/dev/null <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE inherited_executor NOLOGIN;
CREATE ROLE table_owner NOLOGIN;
CREATE ROLE drift_owner NOLOGIN;
CREATE ROLE function_owner_one NOLOGIN;
CREATE ROLE function_owner_two NOLOGIN;
CREATE ROLE function_owner_three NOLOGIN;
CREATE ROLE function_owner_four NOLOGIN;
CREATE ROLE arbitrary_owner NOLOGIN;
CREATE ROLE migration_actor NOLOGIN;
CREATE ROLE unauthorized_actor NOLOGIN;
GRANT table_owner, drift_owner, function_owner_one, function_owner_two, function_owner_three, function_owner_four TO migration_actor;
SQL

create_case() {
  local suffix="$1" database="${database_prefix}_${1}"
  createdb "$database"
  databases+=("$database")
  psql -v ON_ERROR_STOP=1 -d "$database" -f supabase/migrations/20260710210000_one_time_trial_reminder_attempt.sql >/dev/null
  psql -v ON_ERROR_STOP=1 -d "$database" >/dev/null <<'SQL'
ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO table_owner;
ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO table_owner;
ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner;
ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner;
GRANT USAGE, CREATE ON SCHEMA public TO table_owner, drift_owner, function_owner_one, function_owner_two, function_owner_three, function_owner_four, arbitrary_owner, migration_actor, unauthorized_actor;
SQL
  printf '%s' "$database"
}

run_as_actor_file() {
  local database="$1" actor="$2" file="$3"
  psql -v ON_ERROR_STOP=1 -d "$database" >/dev/null <<SQL
SET ROLE $actor;
\i $file
RESET ROLE;
SQL
}

configure_owner_shape() {
  local database="$1" cardinality="$2"
  local ownership_sql
  case "$cardinality" in
    1) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO migration_actor;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO migration_actor;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO migration_actor;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO migration_actor;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO migration_actor;' ;;
    2) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO migration_actor;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO migration_actor;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO migration_actor;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO migration_actor;' ;;
    3) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO drift_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO drift_owner;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner;' ;;
    4) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO function_owner_one;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO function_owner_one;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO function_owner_two;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO function_owner_two;' ;;
    5) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO function_owner_one;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO function_owner_two;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO function_owner_three;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO function_owner_three;' ;;
    6) ownership_sql='ALTER TABLE public.one_time_email_attempts OWNER TO table_owner;
      ALTER FUNCTION public.prevent_one_time_email_attempt_mutation() OWNER TO function_owner_one;
      ALTER FUNCTION public.prevent_one_time_email_attempt_delete() OWNER TO function_owner_two;
      ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO function_owner_three;
      ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO function_owner_four;' ;;
    *) echo "Unsupported owner cardinality" >&2; exit 1 ;;
  esac
  psql -v ON_ERROR_STOP=1 -d "$database" -c "$ownership_sql" >/dev/null
  psql -v ON_ERROR_STOP=1 -d "$database" >/dev/null <<'SQL'
ALTER DEFAULT PRIVILEGES FOR ROLE table_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE drift_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE function_owner_one IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE function_owner_two IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE function_owner_three IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE function_owner_four IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_actor IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE arbitrary_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
SQL
}

for cardinality in 1 2 3 4 5 6; do
  owner_database="$(create_case "owner_cardinality_${cardinality}")"
  configure_owner_shape "$owner_database" "$cardinality"
  run_as_actor_file "$owner_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql
  run_as_actor_file "$owner_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql
  run_as_actor_file "$owner_database" migration_actor supabase/checks/trial-reminder-function-acl-diagnostic.sql
  actual_cardinality="$(psql -v ON_ERROR_STOP=1 -Atq -d "$owner_database" -c "SELECT count(*) FROM (SELECT relowner FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass UNION SELECT proowner FROM pg_proc WHERE oid IN ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure, 'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure) UNION SELECT 'migration_actor'::regrole::oid) owners")"
  [[ "$actual_cardinality" == "$cardinality" ]] || { echo "Owner fixture did not produce cardinality $cardinality" >&2; exit 1; }
  [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$owner_database" -c "SELECT EXISTS (SELECT 1 FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege WHERE defaults.defaclrole = 'arbitrary_owner'::regrole AND defaults.defaclnamespace = 'public'::regnamespace AND defaults.defaclobjtype = 'f' AND privilege.grantee = 'anon'::regrole AND privilege.privilege_type = 'EXECUTE')")" == "t" ]] || { echo "ACL migration altered an unrelated owner" >&2; exit 1; }
  run_as_actor_file "$owner_database" migration_actor supabase/migrations/20260712213000_generic_one_time_email_contract.sql
  run_as_actor_file "$owner_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-present.sql
done

psql -v ON_ERROR_STOP=1 -d "$owner_database" -c 'ALTER FUNCTION public.one_time_operational_email_contract() OWNER TO arbitrary_owner' >/dev/null
if run_as_actor_file "$owner_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-present.sql 2>/dev/null; then
  echo "Present gate accepted helper owner drift" >&2
  exit 1
fi

assert_legacy_gate_fails() {
  if psql -v ON_ERROR_STOP=1 -d "$1" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null 2>&1; then
    echo "Expected legacy ACL preflight RED" >&2
    exit 1
  fi
}

drift_database="$(create_case production_drift)"
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/fixtures/legacy-reminder-production-acl-drift.sql >/dev/null
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT count(*) FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege WHERE defaults.defaclobjtype = 'f' AND privilege.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)")" != "9" ]]; then
  echo "Sanitized fixture did not reproduce default function ACLs" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT count(*) FROM pg_default_acl WHERE defaclobjtype = 'f' AND defaclnamespace = 0")" != "0" ]]; then
  echo "Sanitized fixture unexpectedly created an explicit global default row" >&2
  exit 1
fi
assert_legacy_gate_fails "$drift_database"
run_as_actor_file "$drift_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-legacy-acl-drift.sql
drift_mismatch_database="${database_prefix}_drift_mismatch"
createdb -T "$drift_database" "$drift_mismatch_database"
databases+=("$drift_mismatch_database")
psql -v ON_ERROR_STOP=1 -d "$drift_mismatch_database" -c \
  'REVOKE EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() FROM authenticated' >/dev/null
if run_as_actor_file "$drift_mismatch_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-legacy-acl-drift.sql 2>/dev/null; then
  echo "Drift-aware preflight accepted a partial/non-diagnosed ACL matrix" >&2
  exit 1
fi
run_as_actor_file "$drift_database" migration_actor supabase/checks/trial-reminder-function-acl-diagnostic.sql
run_as_actor_file "$drift_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql
run_as_actor_file "$drift_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql
psql -v ON_ERROR_STOP=1 -d "$drift_database" >/dev/null <<'SQL'
SET ROLE table_owner;
CREATE FUNCTION public.acl_default_probe() RETURNS void LANGUAGE sql AS 'SELECT';
SET ROLE drift_owner;
CREATE FUNCTION public.acl_default_probe_second_owner() RETURNS void LANGUAGE sql AS 'SELECT';
SET ROLE migration_actor;
CREATE FUNCTION public.acl_default_probe_migration_actor() RETURNS void LANGUAGE sql AS 'SELECT';
RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.acl_default_probe_second_owner()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.acl_default_probe_second_owner()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.acl_default_probe_second_owner()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.acl_default_probe_migration_actor()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.acl_default_probe_migration_actor()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.acl_default_probe_migration_actor()', 'EXECUTE')
  THEN RAISE EXCEPTION 'Normalized defaults granted EXECUTE on a newly created helper under a relevant owner'; END IF;
END $$;
DROP FUNCTION public.acl_default_probe();
DROP FUNCTION public.acl_default_probe_second_owner();
DROP FUNCTION public.acl_default_probe_migration_actor();
SQL
run_as_actor_file "$drift_database" migration_actor supabase/migrations/20260712213000_generic_one_time_email_contract.sql
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT count(*) FROM (SELECT relowner AS owner_oid FROM pg_class WHERE oid = 'public.one_time_email_attempts'::regclass UNION SELECT proowner FROM pg_proc WHERE oid IN ('public.prevent_one_time_email_attempt_mutation()'::regprocedure, 'public.prevent_one_time_email_attempt_delete()'::regprocedure, 'public.reserve_trial_user_activation_reminder_attempt()'::regprocedure, 'public.finalize_trial_user_activation_reminder_attempt(text)'::regprocedure) UNION SELECT 'migration_actor'::regrole::oid) owners")" != "3" ]]; then
  echo "Generic migration changed the exact fixture-derived owner set" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT bool_and(proowner = 'migration_actor'::regrole) FROM pg_proc WHERE oid IN ('public.one_time_operational_email_contract()'::regprocedure, 'public.normalize_one_time_operational_email_attempt()'::regprocedure)")" != "t" ]]; then
  echo "Generic helpers were not created by the distinct migration actor" >&2
  exit 1
fi
run_as_actor_file "$drift_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-present.sql
run_as_actor_file "$drift_database" migration_actor supabase/checks/trial-reminder-function-acl-diagnostic.sql

partial_database="$(create_case partial)"
psql -v ON_ERROR_STOP=1 -d "$partial_database" -f supabase/checks/fixtures/legacy-reminder-production-acl-drift.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$partial_database" >/dev/null <<'SQL'
ALTER DEFAULT PRIVILEGES FOR ROLE migration_actor REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_actor IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
SQL
run_as_actor_file "$partial_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql
run_as_actor_file "$partial_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql

for drift in security; do
  database="$(create_case "$drift")"
  setup='ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() SECURITY INVOKER; GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO authenticated;'
  rollback_function='public.prevent_one_time_email_attempt_delete()'
  psql -v ON_ERROR_STOP=1 -d "$database" -c "$setup" >/dev/null
  if run_as_actor_file "$database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql 2>/dev/null; then
    echo "ACL migration accepted $drift drift" >&2
    exit 1
  fi
  [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$database" -c "SELECT has_function_privilege('authenticated', '$rollback_function', 'EXECUTE')")" == "t" ]] || {
    echo "Failed ACL migration did not roll back grants" >&2
    exit 1
  }
done

inherited_database="$(create_case inherited)"
psql -v ON_ERROR_STOP=1 -d "$inherited_database" >/dev/null <<'SQL'
GRANT inherited_executor TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO inherited_executor;
SQL
if run_as_actor_file "$inherited_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql 2>/dev/null; then
  echo "ACL migration accepted inherited effective access" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$inherited_database" -c "SELECT has_function_privilege('anon', 'public.prevent_one_time_email_attempt_delete()', 'EXECUTE')")" != "t" ]]; then
  echo "Failed ACL migration did not roll back inherited-access case" >&2
  exit 1
fi

preservation_database="$(create_case generic_preservation)"
run_as_actor_file "$preservation_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql
run_as_actor_file "$preservation_database" migration_actor supabase/migrations/20260712213000_generic_one_time_email_contract.sql
run_as_actor_file "$preservation_database" migration_actor supabase/checks/trial-user-activation-reminder-preflight-present.sql

partial_actor_database="$(create_case partial_actor_generic)"
run_as_actor_file "$partial_actor_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql
psql -v ON_ERROR_STOP=1 -d "$partial_actor_database" -c 'ALTER DEFAULT PRIVILEGES FOR ROLE migration_actor IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon' >/dev/null
if run_as_actor_file "$partial_actor_database" migration_actor supabase/migrations/20260712213000_generic_one_time_email_contract.sql 2>/dev/null; then
  echo "Generic migration accepted partially reopened actor defaults" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$partial_actor_database" -c "SELECT to_regprocedure('public.one_time_operational_email_contract()') IS NULL")" != "t" ]]; then
  echo "Actor-default rejection left generic helpers behind" >&2
  exit 1
fi

missing_database="$(create_case missing_function)"
psql -v ON_ERROR_STOP=1 -d "$missing_database" >/dev/null <<'SQL'
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO authenticated;
DROP FUNCTION public.finalize_trial_user_activation_reminder_attempt(text);
SQL
if run_as_actor_file "$missing_database" migration_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql 2>/dev/null; then
  echo "ACL migration accepted a missing exact legacy function" >&2
  exit 1
fi
[[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$missing_database" -c "SELECT has_function_privilege('authenticated', 'public.prevent_one_time_email_attempt_delete()', 'EXECUTE')")" == "t" ]] || {
  echo "Missing-object rejection did not preserve prior ACL state" >&2
  exit 1
}

unauthorized_database="$(create_case unauthorized_actor)"
psql -v ON_ERROR_STOP=1 -d "$unauthorized_database" -c 'GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO authenticated' >/dev/null
if run_as_actor_file "$unauthorized_database" unauthorized_actor supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql 2>/dev/null; then
  echo "ACL migration accepted an actor without authority over every relevant owner" >&2
  exit 1
fi
[[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$unauthorized_database" -c "SELECT has_function_privilege('authenticated', 'public.prevent_one_time_email_attempt_delete()', 'EXECUTE')")" == "t" ]] || {
  echo "Unauthorized-actor rejection did not roll back atomically" >&2
  exit 1
}

echo "legacy ACL fixture RED/GREEN, drift, inheritance, rollback, preservation | PASS"
