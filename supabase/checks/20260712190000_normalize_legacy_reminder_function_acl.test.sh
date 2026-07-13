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
DROP ROLE IF EXISTS unknown_owner;
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
CREATE ROLE drift_owner NOLOGIN;
CREATE ROLE unknown_owner NOLOGIN;
SQL

create_case() {
  local suffix="$1" database="${database_prefix}_${1}"
  createdb "$database"
  databases+=("$database")
  psql -v ON_ERROR_STOP=1 -d "$database" -f supabase/migrations/20260710210000_one_time_trial_reminder_attempt.sql >/dev/null
  printf '%s' "$database"
}

assert_legacy_gate_fails() {
  if psql -v ON_ERROR_STOP=1 -d "$1" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null 2>&1; then
    echo "Expected legacy ACL preflight RED" >&2
    exit 1
  fi
}

drift_database="$(create_case production_drift)"
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/fixtures/legacy-reminder-production-acl-drift.sql >/dev/null
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT count(*) FROM pg_default_acl defaults, LATERAL aclexplode(defaults.defaclacl) privilege WHERE defaults.defaclobjtype = 'f' AND privilege.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)")" != "6" ]]; then
  echo "Sanitized fixture did not reproduce default function ACLs" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$drift_database" -c "SELECT count(*) FROM pg_default_acl WHERE defaclobjtype = 'f' AND defaclnamespace = 0")" != "0" ]]; then
  echo "Sanitized fixture unexpectedly created an explicit global default row" >&2
  exit 1
fi
assert_legacy_gate_fails "$drift_database"
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-acl-drift.sql >/dev/null
drift_mismatch_database="${database_prefix}_drift_mismatch"
createdb -T "$drift_database" "$drift_mismatch_database"
databases+=("$drift_mismatch_database")
psql -v ON_ERROR_STOP=1 -d "$drift_mismatch_database" -c \
  'REVOKE EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() FROM authenticated' >/dev/null
if psql -v ON_ERROR_STOP=1 -d "$drift_mismatch_database" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-acl-drift.sql >/dev/null 2>&1; then
  echo "Drift-aware preflight accepted a partial/non-diagnosed ACL matrix" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/trial-reminder-function-acl-diagnostic.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$drift_database" >/dev/null <<'SQL'
CREATE FUNCTION public.acl_default_probe() RETURNS void LANGUAGE sql AS 'SELECT';
SET ROLE drift_owner;
CREATE FUNCTION public.acl_default_probe_second_owner() RETURNS void LANGUAGE sql AS 'SELECT';
RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.acl_default_probe()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.acl_default_probe_second_owner()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.acl_default_probe_second_owner()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.acl_default_probe_second_owner()', 'EXECUTE')
  THEN RAISE EXCEPTION 'Normalized defaults granted EXECUTE on a newly created helper under a relevant owner'; END IF;
END $$;
DROP FUNCTION public.acl_default_probe();
DROP FUNCTION public.acl_default_probe_second_owner();
SQL
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/migrations/20260712213000_generic_one_time_email_contract.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$drift_database" -f supabase/checks/trial-reminder-function-acl-diagnostic.sql >/dev/null

partial_database="$(create_case partial)"
psql -v ON_ERROR_STOP=1 -d "$partial_database" -f supabase/checks/fixtures/legacy-reminder-production-acl-drift.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$partial_database" >/dev/null <<'SQL'
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
SQL
psql -v ON_ERROR_STOP=1 -d "$partial_database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$partial_database" -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null

for drift in security; do
  database="$(create_case "$drift")"
  setup='ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner; ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner; ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() SECURITY INVOKER; GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO authenticated;'
  rollback_function='public.prevent_one_time_email_attempt_delete()'
  psql -v ON_ERROR_STOP=1 -d "$database" -c "$setup" >/dev/null
  if psql -v ON_ERROR_STOP=1 -d "$database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null 2>&1; then
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
ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner;
ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner;
GRANT inherited_executor TO anon;
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO inherited_executor;
SQL
if psql -v ON_ERROR_STOP=1 -d "$inherited_database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null 2>&1; then
  echo "ACL migration accepted inherited effective access" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$inherited_database" -c "SELECT has_function_privilege('anon', 'public.prevent_one_time_email_attempt_delete()', 'EXECUTE')")" != "t" ]]; then
  echo "Failed ACL migration did not roll back inherited-access case" >&2
  exit 1
fi

preservation_database="$(create_case generic_preservation)"
psql -v ON_ERROR_STOP=1 -d "$preservation_database" -c 'ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner; ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner' >/dev/null
psql -v ON_ERROR_STOP=1 -d "$preservation_database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$preservation_database" -f supabase/migrations/20260712213000_generic_one_time_email_contract.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$preservation_database" -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null

unknown_database="$(create_case unknown_third_owner)"
psql -v ON_ERROR_STOP=1 -d "$unknown_database" >/dev/null <<'SQL'
ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner;
ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO unknown_owner;
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO authenticated;
SQL
if psql -v ON_ERROR_STOP=1 -d "$unknown_database" -f supabase/migrations/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null 2>&1; then
  echo "ACL migration accepted an unknown third relevant owner" >&2
  exit 1
fi
[[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$unknown_database" -c "SELECT has_function_privilege('authenticated', 'public.prevent_one_time_email_attempt_delete()', 'EXECUTE')")" == "t" ]] || {
  echo "Unknown-owner rejection did not roll back atomically" >&2
  exit 1
}

echo "legacy ACL fixture RED/GREEN, drift, inheritance, rollback, preservation | PASS"
