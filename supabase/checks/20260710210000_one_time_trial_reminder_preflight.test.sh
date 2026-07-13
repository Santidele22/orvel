#!/usr/bin/env bash
set -euo pipefail

database="orvel_reminder_preflight_test_${$}"
cleanup() { dropdb --if-exists --force "$database" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb "$database"

psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL

psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-pristine.sql >/dev/null

if psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null 2>&1; then
  echo "Expected absent-table migration mismatch to fail" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/20260710210000_one_time_trial_reminder_attempt.sql >/dev/null

# Exact production intermediate state: legacy migration applied, generic
# migration pending. Both accepted row shapes must pass without mutation.
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
VALUES ('legacy-migratable-row', 'trial_user_activation_reminder');
SQL
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null

case_index=0
run_rejection_case() {
  local suffix="$1" setup_sql="$2" case_database
  case_index=$((case_index + 1))
  case_database="${database}_case_${case_index}"
  createdb -T "$database" "$case_database"
  psql -v ON_ERROR_STOP=1 -d "$case_database" -c "$setup_sql" >/dev/null
  if psql -v ON_ERROR_STOP=1 -d "$case_database" \
    -f supabase/checks/trial-user-activation-reminder-preflight-legacy-applied.sql >/dev/null 2>&1; then
    echo "Expected legacy-applied rejection case to fail: $suffix" >&2
    exit 1
  fi
  dropdb --force "$case_database"
}

run_rejection_case terminal \
  "UPDATE public.one_time_email_attempts SET state = 'sent', finalized_at = clock_timestamp();"
run_rejection_case multiple \
  "INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose) VALUES ('second-row', 'trial_user_activation_reminder');"
run_rejection_case inconsistent \
  "ALTER TABLE public.one_time_email_attempts DROP CONSTRAINT one_time_email_attempts_check; ALTER TABLE public.one_time_email_attempts DISABLE TRIGGER one_time_email_attempts_immutable_update; UPDATE public.one_time_email_attempts SET finalized_at = clock_timestamp();"
run_rejection_case column_drift \
  "ALTER TABLE public.one_time_email_attempts ADD COLUMN unexpected text;"
run_rejection_case default_drift \
  "ALTER TABLE public.one_time_email_attempts ALTER COLUMN state DROP DEFAULT;"
run_rejection_case constraint_drift \
  "ALTER TABLE public.one_time_email_attempts DROP CONSTRAINT one_time_email_attempts_state_check; ALTER TABLE public.one_time_email_attempts ADD CONSTRAINT one_time_email_attempts_state_check CHECK (state IS NOT NULL);"
run_rejection_case rls_drift \
  "ALTER TABLE public.one_time_email_attempts DISABLE ROW LEVEL SECURITY;"
run_rejection_case policy_drift \
  "CREATE POLICY unexpected_policy ON public.one_time_email_attempts FOR SELECT USING (true);"
run_rejection_case table_privilege_drift \
  "GRANT SELECT ON public.one_time_email_attempts TO service_role;"
run_rejection_case function_security_drift \
  "ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() SECURITY INVOKER;"
run_rejection_case function_language_drift \
  "CREATE OR REPLACE FUNCTION public.reserve_trial_user_activation_reminder_attempt() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT ''reserved''::text';"
run_rejection_case function_volatility_drift \
  "ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() STABLE;"
run_rejection_case function_definition_drift \
  "CREATE OR REPLACE FUNCTION public.reserve_trial_user_activation_reminder_attempt() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS 'BEGIN RETURN ''reserved''; END';"
run_rejection_case function_privilege_drift \
  "GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO service_role;"
run_rejection_case trigger_enabled_drift \
  "ALTER TABLE public.one_time_email_attempts DISABLE TRIGGER one_time_email_attempts_immutable_delete;"
run_rejection_case trigger_timing_drift \
  "DROP TRIGGER one_time_email_attempts_immutable_delete ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_immutable_delete AFTER DELETE ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_delete();"
run_rejection_case trigger_event_drift \
  "DROP TRIGGER one_time_email_attempts_immutable_delete ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_immutable_delete BEFORE INSERT ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_delete();"
run_rejection_case trigger_function_drift \
  "DROP TRIGGER one_time_email_attempts_immutable_delete ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_immutable_delete BEFORE DELETE ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_mutation();"
run_rejection_case generic_present \
  "CREATE FUNCTION public.one_time_operational_email_contract() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb';"

# Recreate the original zero-row path for the post-migration gate assertions.
dropdb --force "$database"
createdb "$database"
psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/20260710210000_one_time_trial_reminder_attempt.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/20260712213000_generic_one_time_email_contract.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null

run_present_rejection_case() {
  local suffix="$1" setup_sql="$2" case_database
  case_index=$((case_index + 1))
  case_database="${database}_case_${case_index}"
  createdb -T "$database" "$case_database"
  psql -v ON_ERROR_STOP=1 -d "$case_database" -c "$setup_sql" >/dev/null
  if psql -v ON_ERROR_STOP=1 -d "$case_database" \
    -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null 2>&1; then
    echo "Expected present rejection case to fail: $suffix" >&2
    exit 1
  fi
  dropdb --force "$case_database"
}

run_present_rejection_case column "ALTER TABLE public.one_time_email_attempts ALTER COLUMN attempted_at DROP NOT NULL;"
run_present_rejection_case constraint "ALTER TABLE public.one_time_email_attempts DROP CONSTRAINT one_time_email_attempts_purpose_check; ALTER TABLE public.one_time_email_attempts ADD CONSTRAINT one_time_email_attempts_purpose_check CHECK (purpose IS NOT NULL);"
run_present_rejection_case rls "ALTER TABLE public.one_time_email_attempts DISABLE ROW LEVEL SECURITY;"
run_present_rejection_case policy "CREATE POLICY unexpected_policy ON public.one_time_email_attempts FOR SELECT USING (true);"
run_present_rejection_case table_privilege "GRANT SELECT ON public.one_time_email_attempts TO authenticated;"
run_present_rejection_case helper_security "ALTER FUNCTION public.one_time_operational_email_contract() SECURITY DEFINER;"
run_present_rejection_case helper_volatility "ALTER FUNCTION public.one_time_operational_email_contract() VOLATILE;"
run_present_rejection_case helper_definition "CREATE OR REPLACE FUNCTION public.one_time_operational_email_contract() RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, pg_temp AS 'SELECT ''{}''::jsonb';"
run_present_rejection_case rpc_language "CREATE OR REPLACE FUNCTION public.reserve_trial_user_activation_reminder_attempt() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS 'SELECT ''reserved''::text';"
run_present_rejection_case function_privilege "GRANT EXECUTE ON FUNCTION public.one_time_operational_email_contract() TO service_role;"
run_present_rejection_case trigger_enabled "ALTER TABLE public.one_time_email_attempts DISABLE TRIGGER one_time_email_attempts_normalize_insert;"
run_present_rejection_case trigger_timing "DROP TRIGGER one_time_email_attempts_normalize_insert ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_normalize_insert AFTER INSERT ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.normalize_one_time_operational_email_attempt();"
run_present_rejection_case trigger_event "DROP TRIGGER one_time_email_attempts_normalize_insert ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_normalize_insert BEFORE UPDATE ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.normalize_one_time_operational_email_attempt();"
run_present_rejection_case trigger_function "DROP TRIGGER one_time_email_attempts_normalize_insert ON public.one_time_email_attempts; CREATE TRIGGER one_time_email_attempts_normalize_insert BEFORE INSERT ON public.one_time_email_attempts FOR EACH ROW EXECUTE FUNCTION public.prevent_one_time_email_attempt_mutation();"

psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
SELECT value->>'lifecycle_key', value->>'purpose'
FROM (SELECT public.one_time_operational_email_contract() AS value) AS contract;
SQL

if psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null 2>&1; then
  echo "Expected existing lifecycle attempt to fail" >&2
  exit 1
fi

echo "production preflight pristine/legacy-applied/present and rejection cases | PASS"
