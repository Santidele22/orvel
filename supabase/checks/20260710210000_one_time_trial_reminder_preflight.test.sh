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

psql -v ON_ERROR_STOP=1 -v expected_guard_state=absent -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null

if psql -v ON_ERROR_STOP=1 -v expected_guard_state=present -d "$database" \
  -f supabase/checks/trial-user-activation-reminder-production-preflight.sql >/dev/null 2>&1; then
  echo "Expected absent-table migration mismatch to fail" >&2
  exit 1
fi

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

echo "production preflight absent/present/mismatch/existing-row | PASS"
