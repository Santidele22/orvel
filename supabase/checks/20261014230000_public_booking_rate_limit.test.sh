#!/usr/bin/env bash
# Postgres verification for the public booking rate-limit guard (#1165).
# Extracts the table + guard DDL straight from the migration file, applies it
# to a scratch database, and asserts the guard semantics and ACLs.
# Requires psql (PGHOST/PGUSER/PGPASSWORD/PGDATABASE env or defaults).
set -euo pipefail

DDL="$(mktemp)"
trap 'rm -f "$DDL"' EXIT

# Slice the migration from the table creation through the guard REVOKE.
awk '/^CREATE TABLE IF NOT EXISTS public.public_booking_rate_limits/,/^REVOKE ALL ON FUNCTION public._guard_public_booking_rate_limit/' \
  supabase/migrations/20261014230000_public_booking_rate_limit.sql > "$DDL"

grep -q "_guard_public_booking_rate_limit" "$DDL" || { echo "DDL slice is empty or incomplete" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
SQL

psql -v ON_ERROR_STOP=1 -q -f "$DDL"

run_psql() {
  psql -v ON_ERROR_STOP=1 -Atq "$@"
}

# Five calls within the default window are allowed; the sixth is rejected.
for i in 1 2 3 4 5; do
  [[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-a')")" == "f" ]] \
    || { echo "FAIL: call $i for bucket-a was throttled" >&2; exit 1; }
done
[[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-a')")" == "t" ]] \
  || { echo "FAIL: sixth call for bucket-a was not throttled" >&2; exit 1; }

# Buckets are independent.
[[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-b')")" == "f" ]] \
  || { echo "FAIL: bucket-b was throttled by bucket-a traffic" >&2; exit 1; }

# Custom limits and window are honored.
[[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-c', 2, interval '1 minute')")" == "f" ]] \
  || { echo "FAIL: first call for bucket-c throttled" >&2; exit 1; }
[[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-c', 2, interval '1 minute')")" == "f" ]] \
  || { echo "FAIL: second call for bucket-c throttled" >&2; exit 1; }
[[ "$(run_psql -c "SELECT public._guard_public_booking_rate_limit('bucket-c', 2, interval '1 minute')")" == "t" ]] \
  || { echo "FAIL: third call for bucket-c not throttled with max 2" >&2; exit 1; }

# The guard is not executable by any direct role (internal-only).
for role in anon authenticated service_role; do
  [[ "$(run_psql -c "SELECT has_function_privilege('$role', 'public._guard_public_booking_rate_limit(text, integer, interval)', 'EXECUTE')")" == "f" ]] \
    || { echo "FAIL: $role can execute the guard directly" >&2; exit 1; }
done

# The table has RLS enabled.
[[ "$(run_psql -c "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.public_booking_rate_limits'::regclass")" == "t" ]] \
  || { echo "FAIL: public_booking_rate_limits lacks RLS" >&2; exit 1; }

echo "public booking rate limit guard | PASS"
