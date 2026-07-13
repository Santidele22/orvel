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

psql -v ON_ERROR_STOP=1 -v expected_guard_state=pristine -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null

if psql -v ON_ERROR_STOP=1 -v expected_guard_state=present -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null 2>&1; then
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

run_rejection_case() {
  local suffix="$1" setup_sql="$2" case_database
  case_database="${database}_${suffix}"
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
run_rejection_case schema_drift \
  "ALTER TABLE public.one_time_email_attempts ADD COLUMN unexpected text;"
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
psql -v ON_ERROR_STOP=1 -v expected_guard_state=present -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null

psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
SELECT value->>'lifecycle_key', value->>'purpose'
FROM (SELECT public.one_time_operational_email_contract() AS value) AS contract;
SQL

if psql -v ON_ERROR_STOP=1 -v expected_guard_state=present -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null 2>&1; then
  echo "Expected existing lifecycle attempt to fail" >&2
  exit 1
fi

echo "production preflight pristine/legacy-applied/present and rejection cases | PASS"
