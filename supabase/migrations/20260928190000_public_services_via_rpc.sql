-- Closes the largest exposure found by the 2026-09-28 dashboard security audit.
--
-- `services` had a SELECT policy for `anon` that filtered by `is_active` but NOT
-- by tenant (`20260629190000_harden_public_services_rls.sql:7-11`), and table
-- access was never revoked from `anon`. Anyone holding the public anon key could
-- read `services?select=*` without a business filter and enumerate name, price
-- and `business_id` for **every** tenant. `20260928150000_harden_public_tenant_reads.sql:16-25`
-- acknowledged this and deferred it to an expand/contract; this is that contract.
--
-- Shape: the public catalogue moves behind a SECURITY DEFINER RPC that takes the
-- business id as an argument, so the tenant filter is enforced by the database
-- instead of by the client. Table-level SELECT is revoked from `anon`; managers
-- keep their existing policy (`Business managers manage services`,
-- `can_manage_business(business_id)`).
--
-- The RPC returns `SETOF public.services` on purpose: the dashboard maps whole
-- rows (`mapSupabaseRowToServicio`) and the table has no sensitive columns
-- (id, business_id, name, description, category, duration_minutes, price,
-- is_active, created_at, updated_at). Narrowing the projection is a separate
-- follow-up.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_public_services(
  p_business_id uuid,
  p_active_only boolean DEFAULT true
)
RETURNS SETOF public.services
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT *
  FROM public.services s
  WHERE s.business_id = p_business_id
    AND CASE
      -- Managers (and owners) keep full visibility, including inactive rows when
      -- they explicitly ask for them.
      WHEN public.can_manage_business(p_business_id)
        THEN (NOT p_active_only OR COALESCE(s.is_active, true))
      -- Everyone else, including anonymous visitors, only ever sees active
      -- services of the single business they asked for.
      ELSE COALESCE(s.is_active, true)
    END
  ORDER BY s.name ASC;
$$;

REVOKE ALL ON FUNCTION public.list_public_services(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_services(uuid, boolean) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
