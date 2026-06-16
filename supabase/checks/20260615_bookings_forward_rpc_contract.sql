-- Forward-fix regression check for public.bookings direct-grant revocation.
--
-- How to use after applying the forward migration:
--   supabase db query < supabase/checks/20260615_bookings_forward_rpc_contract.sql
--
-- Expected result: zero rows.
--
-- The forward-fix may choose function names, but each replacement RPC must carry
-- a pg_description marker so this check can validate security metadata without
-- reopening direct public.bookings grants:
--   comment on function public.<admin-list-rpc>(...) is '@orvel-contract admin_booking_list';
--   comment on function public.<active-branch-rpc>(...) is '@orvel-contract active_branch_assertion';
--   comment on function public.<public-context-rpc>(...) is '@orvel-contract public_booking_context';

with direct_bookings_grants as (
  select
    case when grant_items.grantee = 0 then 'PUBLIC' else grant_items.grantee::regrole::text end as grantee,
    grant_items.privilege_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as grant_items
  where n.nspname = 'public'
    and c.relname = 'bookings'
    and c.relkind in ('r', 'p')
    and grant_items.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
    and case when grant_items.grantee = 0 then 'PUBLIC' else grant_items.grantee::regrole::text end in ('PUBLIC', 'anon', 'authenticated')
),
contract_functions as (
  select
    p.oid,
    n.nspname,
    p.proname,
    p.prosecdef,
    p.proconfig,
    obj_description(p.oid, 'pg_proc') as description
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and obj_description(p.oid, 'pg_proc') like '@orvel-contract %'
),
required_contracts(contract_name, required_grantee, forbidden_grantee) as (
  values
    ('admin_booking_list', 'authenticated', 'anon'),
    ('active_branch_assertion', 'authenticated', 'anon'),
    ('public_booking_context', 'anon', null)
),
matched_contracts as (
  select
    rc.contract_name,
    rc.required_grantee,
    rc.forbidden_grantee,
    cf.oid,
    cf.proname,
    cf.prosecdef,
    cf.proconfig
  from required_contracts rc
  left join contract_functions cf
    on cf.description = '@orvel-contract ' || rc.contract_name
),
violations as (
  select
    'HIGH' as severity,
    'public_bookings_direct_grants_remain' as check_name,
    format('Unexpected direct grant on public.bookings: grantee=%s, privilege=%s', grantee, privilege_type) as details
  from direct_bookings_grants

  union all

  select
    'HIGH' as severity,
    'required_rpc_contract_missing' as check_name,
    format('Missing SECURITY DEFINER RPC tagged @orvel-contract %s', contract_name) as details
  from matched_contracts
  where oid is null

  union all

  select
    'HIGH' as severity,
    'required_rpc_not_security_definer' as check_name,
    format('RPC tagged @orvel-contract %s is not SECURITY DEFINER: public.%s', contract_name, proname) as details
  from matched_contracts
  where oid is not null
    and prosecdef is not true

  union all

  select
    'MEDIUM' as severity,
    'required_rpc_search_path_missing' as check_name,
    format('RPC tagged @orvel-contract %s must set search_path to public, pg_temp: public.%s', contract_name, proname) as details
  from matched_contracts
  where oid is not null
    and not exists (
      select 1
      from unnest(coalesce(proconfig, array[]::text[])) as setting
      where setting = 'search_path=public, pg_temp'
    )

  union all

  select
    'HIGH' as severity,
    'required_rpc_execute_grant_missing' as check_name,
    format('RPC tagged @orvel-contract %s lacks EXECUTE for %s: public.%s', contract_name, required_grantee, proname) as details
  from matched_contracts
  where oid is not null
    and not has_function_privilege(required_grantee, oid, 'EXECUTE')

  union all

  select
    'HIGH' as severity,
    'admin_rpc_anon_execute_grant_forbidden' as check_name,
    format('Admin RPC tagged @orvel-contract %s unexpectedly grants EXECUTE to anon: public.%s', contract_name, proname) as details
  from matched_contracts
  where oid is not null
    and forbidden_grantee is not null
    and has_function_privilege(forbidden_grantee, oid, 'EXECUTE')
)
select severity, check_name, details
from violations
order by severity, check_name, details;
