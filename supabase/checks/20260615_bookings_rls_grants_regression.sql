-- Regression check for the public.bookings RLS/grants hardening fix.
--
-- How to use:
--   supabase db query < supabase/checks/20260615_bookings_rls_grants_regression.sql
--
-- Expected result after the forward migration: zero rows.
-- If any row is returned, the migration did not satisfy the regression contract.

with target_policies as (
  select
    policyname,
    cmd,
    roles,
    with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'bookings'
    and policyname = 'Public create bookings'
),
raw_direct_grants as (
  select
    case
      when grant_items.grantee = 0 then 'PUBLIC'
      else grant_items.grantee::regrole::text
    end as grantee,
    grant_items.privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as grant_items
  where n.nspname = 'public'
    and c.relname = 'bookings'
    and c.relkind in ('r', 'p')
    and grant_items.privilege_type in (
      'INSERT',
      'SELECT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    )
),
target_direct_grants as (
  select grantee, privilege_type
  from raw_direct_grants
  where grantee in ('PUBLIC', 'anon', 'authenticated')
),
expected_rpc_grants(signature, grantee) as (
  values
    ('public.create_public_booking(text,text,text,jsonb,text,text)', 'anon'),
    ('public.create_public_booking(text,text,text,jsonb,text,text)', 'authenticated'),
    ('public.create_public_booking(text,text,text,jsonb,text,text,text)', 'anon'),
    ('public.create_public_booking(text,text,text,jsonb,text,text,text)', 'authenticated')
),
rpc_resolution as (
  select
    signature,
    grantee,
    to_regprocedure(signature) as function_oid
  from expected_rpc_grants
),
violations as (
  select
    'HIGH' as severity,
    'public_bookings_policy_removed' as check_name,
    format(
      'Unexpected policy still exists: %s, cmd=%s, roles=%s, with_check=%s',
      policyname,
      cmd,
      roles,
      with_check
    ) as details
  from target_policies

  union all

  select
    'HIGH' as severity,
    'public_bookings_direct_grants_revoked' as check_name,
    format(
      'Unexpected direct table grant remains on public.bookings: grantee=%s, privilege=%s',
      grantee,
      privilege_type
    ) as details
  from target_direct_grants

  union all

  select
    'HIGH' as severity,
    'create_public_booking_rpc_execute_preserved' as check_name,
    case
      when function_oid is null then format('Missing RPC overload: %s', signature)
      else format('Missing EXECUTE grant: grantee=%s, function=%s', grantee, signature)
    end as details
  from rpc_resolution
  where function_oid is null
     or not has_function_privilege(grantee, function_oid, 'EXECUTE')
)
select severity, check_name, details
from violations
order by severity, check_name, details;
