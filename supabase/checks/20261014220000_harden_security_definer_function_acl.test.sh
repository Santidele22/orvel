#!/usr/bin/env bash
# Postgres verification for 20261014220000_harden_security_definer_function_acl.sql.
# Applies a minimal pre-fix fixture, runs the migration, and asserts the ACLs and
# the entitlements guard behave as intended. Requires a running Postgres with psql
# (PGDATABASE/PGHOST/... env or defaults).
set -euo pipefail

run_psql() {
  psql -v ON_ERROR_STOP=1 -Atq "$@"
}

# 1. Apply fixture (pre-fix state) and the migration.
psql -v ON_ERROR_STOP=1 -q -f supabase/checks/fixtures/20261014220000_acl_hardening_prefixture.sql
psql -v ON_ERROR_STOP=1 -q -f supabase/migrations/20261014220000_harden_security_definer_function_acl.sql

# 2. #1162: anon and authenticated can no longer execute release_expired_booking_hold.
for role in anon authenticated; do
  [[ "$(run_psql -c "SELECT has_function_privilege('$role', 'public.release_expired_booking_hold(uuid, uuid)', 'EXECUTE')")" == "f" ]] \
    || { echo "#1162 FAIL: $role still executes release_expired_booking_hold" >&2; exit 1; }
done
[[ "$(run_psql -c "SELECT has_function_privilege('service_role', 'public.release_expired_booking_hold(uuid, uuid)', 'EXECUTE')")" == "t" ]] \
  || { echo "#1162 FAIL: service_role lost execute on release_expired_booking_hold" >&2; exit 1; }

# 3. #1163: _read_business_booking_config is not executable by public-facing roles.
for role in anon authenticated; do
  [[ "$(run_psql -c "SELECT has_function_privilege('$role', 'public._read_business_booking_config(uuid)', 'EXECUTE')")" == "f" ]] \
    || { echo "#1163 FAIL: $role still executes _read_business_booking_config" >&2; exit 1; }
done

# 4. #1169: trigger helpers revoked from PUBLIC and client roles.
for fn in request_web_push_outbox_processing ensure_business_principal_branch handle_booking_notifications enqueue_web_push_outbox; do
  for role in anon authenticated; do
    [[ "$(run_psql -c "SELECT has_function_privilege('$role', 'public.$fn()', 'EXECUTE')")" == "f" ]] \
      || { echo "#1169 FAIL: $role still executes $fn" >&2; exit 1; }
  done
done

# 5. #1164: entitlements guard rejects a non-owner authenticated caller (42501).
if run_psql -c "SET test.role = 'authenticated'; SET test.uid = '22222222-2222-2222-2222-222222222222'; SELECT * FROM public.get_business_entitlements_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222')" 2>/dev/null; then
  echo "#1164 FAIL: non-owner authenticated caller read entitlements" >&2
  exit 1
fi

# 6. #1164: the owner still reads their own snapshot (dashboard flow keeps working).
[[ "$(run_psql -c "SET test.role = 'authenticated'; SET test.uid = '11111111-1111-1111-1111-111111111111'; SELECT plan_code FROM public.get_business_entitlements_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111')")" == "FREE" ]] \
  || { echo "#1164 FAIL: owner cannot read own entitlements" >&2; exit 1; }

# 7. #1164: service_role bypasses the guard (Edge Functions keep working).
[[ "$(run_psql -c "SET test.role = 'service_role'; SET test.uid = ''; SELECT plan_code FROM public.get_business_entitlements_snapshot('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111')")" == "FREE" ]] \
  || { echo "#1164 FAIL: service_role blocked from entitlements" >&2; exit 1; }

echo "acl hardening migration | PASS"
