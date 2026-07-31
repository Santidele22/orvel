#!/usr/bin/env bash
set -euo pipefail

database_prefix="orvel_generic_email_migration_${$}"
databases=()

cleanup() {
  local database
  rm -f "/tmp/${database_prefix}_"*
  for database in "${databases[@]}"; do
    dropdb --if-exists --force "$database" >/dev/null 2>&1 || true
  done
  psql -v ON_ERROR_STOP=1 -d "$PGDATABASE" >/dev/null 2>&1 <<'SQL' || true
DROP ROLE IF EXISTS anon;
DROP ROLE IF EXISTS authenticated;
DROP ROLE IF EXISTS service_role;
SQL
}
trap cleanup EXIT

create_case_database() {
  local suffix="$1"
  local database="${database_prefix}_${suffix}"
  createdb "$database"
  databases+=("$database")
  psql -v ON_ERROR_STOP=1 -d "$database" >/dev/null <<'SQL'
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
SQL
  psql -v ON_ERROR_STOP=1 -d "$database" \
    -f supabase/migrations/_legacy/20260710210000_one_time_trial_reminder_attempt.sql >/dev/null
  psql -v ON_ERROR_STOP=1 -d "$database" \
    -f supabase/migrations/_legacy/20260712190000_normalize_legacy_reminder_function_acl.sql >/dev/null
  printf '%s' "$database"
}

apply_forward_migration() {
  psql -v ON_ERROR_STOP=1 -d "$1" \
    -f supabase/migrations/_legacy/20260712213000_generic_one_time_email_contract.sql >/dev/null
}

wait_for_activity() {
  local database="$1"
  local application_name="$2"
  local predicate="$3"
  local description="$4"
  local count
  for _ in {1..250}; do
    count="$(psql -v ON_ERROR_STOP=1 -Atq -d "$database" -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$application_name' AND ($predicate)")"
    [[ "$count" != "0" ]] && return 0
    sleep 0.02
  done
  echo "Timed out establishing concurrency ordering: $description" >&2
  return 1
}

absent_database="$(create_case_database absent)"
apply_forward_migration "$absent_database"
psql -v ON_ERROR_STOP=1 -d "$absent_database" \
  -f supabase/checks/trial-user-activation-reminder-preflight-present.sql >/dev/null
psql -v ON_ERROR_STOP=1 -d "$absent_database" >/dev/null <<'SQL'
DO $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
BEGIN
  IF (SELECT count(*) FROM public.one_time_email_attempts) <> 0 THEN
    RAISE EXCEPTION 'Absent-row migration created an attempt';
  END IF;
  IF public.reserve_trial_user_activation_reminder_attempt() <> 'reserved'
    OR public.reserve_trial_user_activation_reminder_attempt() <> 'already_consumed'
  THEN
    RAISE EXCEPTION 'Generic reservation is not at-most-once';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.one_time_email_attempts
    WHERE lifecycle_key = v_contract->>'lifecycle_key'
      AND purpose = v_contract->>'purpose'
      AND state = 'reserved'
  ) THEN
    RAISE EXCEPTION 'Generic reservation contract missing';
  END IF;
END $$;
SQL

pending_database="$(create_case_database pending)"
psql -v ON_ERROR_STOP=1 -d "$pending_database" >/dev/null <<'SQL'
SELECT public.reserve_trial_user_activation_reminder_attempt();
CREATE TABLE public.migration_test_snapshot AS
SELECT attempted_at FROM public.one_time_email_attempts;
SQL
apply_forward_migration "$pending_database"
psql -v ON_ERROR_STOP=1 -d "$pending_database" >/dev/null <<'SQL'
DO $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.one_time_email_attempts AS attempt
    CROSS JOIN public.migration_test_snapshot AS snapshot
    WHERE attempt.lifecycle_key = v_contract->>'lifecycle_key'
      AND attempt.purpose = v_contract->>'purpose'
      AND attempt.state = 'reserved'
      AND attempt.finalized_at IS NULL
      AND attempt.attempted_at = snapshot.attempted_at
  ) THEN
    RAISE EXCEPTION 'Pending-row transform did not preserve durable reservation';
  END IF;
  IF public.reserve_trial_user_activation_reminder_attempt() <> 'already_consumed' THEN
    RAISE EXCEPTION 'Pending-row transform allowed duplicate reservation';
  END IF;
END $$;
SQL

for terminal_state in sent rejected ambiguous; do
  terminal_database="$(create_case_database "$terminal_state")"
  psql -v ON_ERROR_STOP=1 -v terminal_state="$terminal_state" -d "$terminal_database" >/dev/null <<'SQL'
SELECT public.reserve_trial_user_activation_reminder_attempt();
SELECT public.finalize_trial_user_activation_reminder_attempt(:'terminal_state');
SQL
  if apply_forward_migration "$terminal_database" 2>/dev/null; then
    echo "Forward migration accepted terminal state: $terminal_state" >&2
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 -d "$terminal_database" >/dev/null <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM public.one_time_email_attempts) <> 1
    OR to_regprocedure('public.one_time_operational_email_contract()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Failed migration did not roll back terminal row';
  END IF;
  IF public.reserve_trial_user_activation_reminder_attempt() <> 'already_consumed' THEN
    RAISE EXCEPTION 'Failed migration weakened terminal reservation';
  END IF;
END $$;
SQL
  if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$terminal_database" -c 'SELECT state FROM public.one_time_email_attempts')" != "$terminal_state" ]]; then
    echo "Failed migration changed terminal state: $terminal_state" >&2
    exit 1
  fi
done

unexpected_database="$(create_case_database unexpected)"
psql -v ON_ERROR_STOP=1 -d "$unexpected_database" >/dev/null <<'SQL'
SELECT public.reserve_trial_user_activation_reminder_attempt();
INSERT INTO public.one_time_email_attempts (lifecycle_key, purpose)
SELECT 'unexpected-second-key', purpose FROM public.one_time_email_attempts LIMIT 1;
SQL
if apply_forward_migration "$unexpected_database" 2>/dev/null; then
  echo "Forward migration accepted unexpected rows" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$unexpected_database" -c 'SELECT count(*) FROM public.one_time_email_attempts')" != "2" ]]; then
  echo "Failed migration did not roll back unexpected-row case" >&2
  exit 1
fi

permissions_database="$(create_case_database permissions)"
apply_forward_migration "$permissions_database"
psql -v ON_ERROR_STOP=1 -d "$permissions_database" >/dev/null <<'SQL'
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.one_time_operational_email_contract()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.one_time_operational_email_contract()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.one_time_operational_email_contract()', 'EXECUTE')
    OR has_function_privilege('anon', 'public.normalize_one_time_operational_email_attempt()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.normalize_one_time_operational_email_attempt()', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.normalize_one_time_operational_email_attempt()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Canonical lifecycle helper is externally executable';
  END IF;
END $$;
SQL

race_reservation_first="$(create_case_database race_reservation_first)"
reservation_first_result="/tmp/${database_prefix}_reservation_first"
reservation_first_release="/tmp/${database_prefix}_reservation_first_release"
mkfifo "$reservation_first_release"
(
  PGAPPNAME='orvel-reservation-first' timeout 15s psql -v ON_ERROR_STOP=1 -Atq -d "$race_reservation_first" >"$reservation_first_result" <<SQL
BEGIN;
SELECT public.reserve_trial_user_activation_reminder_attempt();
\! cat "$reservation_first_release" >/dev/null
COMMIT;
SQL
) &
reservation_pid=$!
wait_for_activity "$race_reservation_first" 'orvel-reservation-first' \
  "state = 'idle in transaction'" 'historical reservation committed its INSERT before migration queued'
(
  PGAPPNAME='orvel-migration-after-reservation' timeout 15s psql -v ON_ERROR_STOP=1 -d "$race_reservation_first" \
    -f supabase/migrations/_legacy/20260712213000_generic_one_time_email_contract.sql >/dev/null
) &
reservation_first_migration_pid=$!
wait_for_activity "$race_reservation_first" 'orvel-migration-after-reservation' \
  "wait_event_type = 'Lock'" 'migration waiting behind historical reservation'
printf 'release\n' >"$reservation_first_release"
wait "$reservation_pid"
wait "$reservation_first_migration_pid"
[[ "$(tr -d '\r\n' <"$reservation_first_result")" == "reserved" ]] || {
  echo "Historical reservation did not complete before migration" >&2
  exit 1
}
rm -f "$reservation_first_result"

race_migration_first="$(create_case_database race_migration_first)"
migration_first_result="/tmp/${database_prefix}_migration_first"
migration_first_release="/tmp/${database_prefix}_migration_first_release"
mkfifo "$migration_first_release"
(
  PGAPPNAME='orvel-migration-blocker' timeout 15s psql -v ON_ERROR_STOP=1 -d "$race_migration_first" >/dev/null <<SQL
BEGIN;
LOCK TABLE public.one_time_email_attempts IN ACCESS EXCLUSIVE MODE;
\! cat "$migration_first_release" >/dev/null
COMMIT;
SQL
) &
blocker_pid=$!
wait_for_activity "$race_migration_first" 'orvel-migration-blocker' \
  "state = 'idle in transaction'" 'exclusive blocker acquired before migration'
(
  PGAPPNAME='orvel-migration-first' timeout 15s psql -v ON_ERROR_STOP=1 -d "$race_migration_first" \
    -f supabase/migrations/_legacy/20260712213000_generic_one_time_email_contract.sql >/dev/null
) &
migration_pid=$!
wait_for_activity "$race_migration_first" 'orvel-migration-first' \
  "wait_event_type = 'Lock'" 'migration queued before historical reservation'
(
  PGAPPNAME='orvel-reservation-after-migration' timeout 15s psql -v ON_ERROR_STOP=1 -Atq -d "$race_migration_first" \
    -c 'SELECT public.reserve_trial_user_activation_reminder_attempt()' >"$migration_first_result"
) &
second_reservation_pid=$!
wait_for_activity "$race_migration_first" 'orvel-reservation-after-migration' \
  "wait_event_type = 'Lock'" 'historical reservation queued behind migration'
printf 'release\n' >"$migration_first_release"
wait "$blocker_pid"
wait "$migration_pid"
wait "$second_reservation_pid"
[[ "$(tr -d '\r\n' <"$migration_first_result")" == "reserved" ]] || {
  echo "Reservation did not complete after migration-first serialization" >&2
  exit 1
}
rm -f "$migration_first_result" "$migration_first_release"

race_timeout="$(create_case_database race_timeout)"
timeout_release="/tmp/${database_prefix}_timeout_release"
mkfifo "$timeout_release"
(
  PGAPPNAME='orvel-timeout-holder' timeout 15s psql -v ON_ERROR_STOP=1 -d "$race_timeout" >/dev/null <<SQL
BEGIN;
SELECT public.reserve_trial_user_activation_reminder_attempt();
\! cat "$timeout_release" >/dev/null
COMMIT;
SQL
) &
timeout_holder_pid=$!
wait_for_activity "$race_timeout" 'orvel-timeout-holder' \
  "state = 'idle in transaction'" 'reservation holder established before timeout migration'
timeout_started_at="$(date +%s%3N)"
(
  PGAPPNAME='orvel-intrinsic-timeout' timeout 12s psql -v ON_ERROR_STOP=1 -d "$race_timeout" \
    -f supabase/migrations/_legacy/20260712213000_generic_one_time_email_contract.sql >/dev/null 2>&1
) &
timeout_migration_pid=$!
wait_for_activity "$race_timeout" 'orvel-intrinsic-timeout' \
  "wait_event_type = 'Lock'" 'intrinsically bounded migration waiting on reservation'
if wait "$timeout_migration_pid"; then
  echo "Forward migration ignored bounded lock timeout" >&2
  exit 1
fi
timeout_elapsed_ms=$(( $(date +%s%3N) - timeout_started_at ))
if (( timeout_elapsed_ms < 4000 || timeout_elapsed_ms > 10000 )); then
  echo "Intrinsic migration lock timeout outside expected bound: ${timeout_elapsed_ms}ms" >&2
  exit 1
fi
if [[ "$(psql -v ON_ERROR_STOP=1 -Atq -d "$race_timeout" -c \
  "SELECT to_regprocedure('public.one_time_operational_email_contract()') IS NOT NULL")" == "t" ]]; then
  echo "Timed-out migration left partial schema state" >&2
  exit 1
fi
printf 'release\n' >"$timeout_release"
wait "$timeout_holder_pid"
rm -f "$timeout_release"
apply_forward_migration "$race_timeout"

for race_database in "$race_reservation_first" "$race_migration_first" "$race_timeout"; do
  psql -v ON_ERROR_STOP=1 -d "$race_database" >/dev/null <<'SQL'
DO $$
DECLARE
  v_contract jsonb := public.one_time_operational_email_contract();
BEGIN
  IF (SELECT count(*) FROM public.one_time_email_attempts) <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.one_time_email_attempts
      WHERE lifecycle_key = v_contract->>'lifecycle_key'
        AND purpose = v_contract->>'purpose'
        AND state = 'reserved'
        AND finalized_at IS NULL
    )
    OR public.reserve_trial_user_activation_reminder_attempt() <> 'already_consumed'
  THEN
    RAISE EXCEPTION 'Migration/reservation race lost or duplicated durable state';
  END IF;
END $$;
SQL
done

echo "generic lifecycle absent/pending/terminal/unexpected/rollback/race | PASS"
