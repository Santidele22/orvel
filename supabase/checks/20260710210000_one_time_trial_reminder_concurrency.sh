#!/usr/bin/env bash
set -euo pipefail

# Creates and destroys an isolated database using standard libpq PG* variables.
# The caller must point PGDATABASE at a maintenance database and have CREATEDB.
database="orvel_reminder_test_${$}"
first_result="/tmp/${database}_first"
second_result="/tmp/${database}_second"

cleanup() {
  rm -f "$first_result" "$second_result"
  dropdb --if-exists --force "$database" >/dev/null 2>&1 || true
}
trap cleanup EXIT

createdb "$database"

psql -v ON_ERROR_STOP=1 -d "$database" <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.notification_email_outbox (id bigint);
SQL

psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/_legacy/20260710210000_one_time_trial_reminder_attempt.sql

psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/checks/20260710210000_one_time_trial_reminder_attempt.sql

psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/_legacy/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$database" \
  -f supabase/migrations/_legacy/20260712213000_generic_one_time_email_contract.sql

(
  psql -v ON_ERROR_STOP=1 -Atq -d "$database" >"$first_result" <<'SQL'
BEGIN;
SELECT public.reserve_trial_user_activation_reminder_attempt();
SELECT pg_sleep(2);
COMMIT;
SQL
) &
first_pid=$!

sleep 0.5
psql -v ON_ERROR_STOP=1 -Atq -d "$database" >"$second_result" <<'SQL'
SELECT public.reserve_trial_user_activation_reminder_attempt();
SQL
wait "$first_pid"

if [[ "$(tr -d '\r\n' <"$first_result")" != "reserved" ]]; then
  echo "First concurrent session did not reserve" >&2
  exit 1
fi

if [[ "$(tr -d '\r\n' <"$second_result")" != "already_consumed" ]]; then
  echo "Second concurrent session was not rejected" >&2
  exit 1
fi

durable_result="$(psql -v ON_ERROR_STOP=1 -Atq -d "$database" <<'SQL'
WITH contract AS (
  SELECT public.one_time_operational_email_contract() AS value
)
SELECT CASE
  WHEN count(*) = 1
    AND min(lifecycle_key) = min(contract.value->>'lifecycle_key')
    AND min(purpose) = min(contract.value->>'purpose')
    AND min(state) = 'reserved'
  THEN 'concurrency | PASS'
  ELSE 'concurrency | FAIL'
END
FROM public.one_time_email_attempts
CROSS JOIN contract;
SQL
)"

if [[ "$durable_result" != "concurrency | PASS" ]]; then
  echo "Unexpected durable concurrency result: $durable_result" >&2
  exit 1
fi

echo "$durable_result"
