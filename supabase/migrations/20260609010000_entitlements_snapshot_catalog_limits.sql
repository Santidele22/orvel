-- Ensure business entitlement snapshots expose the full DB-owned plan limit contract.
-- The catalog remains the source of truth: limits come from public.plans and plan
-- aliases resolve through public.plan_aliases before joining the canonical plan row.

BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_locales integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_rubros integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_monthly_bookings integer,
  ADD COLUMN IF NOT EXISTS ai_credits_monthly integer DEFAULT 0;

DROP FUNCTION IF EXISTS public.get_business_entitlements_snapshot(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_business_entitlements_snapshot(p_business_id uuid, p_tenant_id uuid)
RETURNS TABLE (
  business_id uuid,
  tenant_id uuid,
  subscription_status text,
  plan_code text,
  max_locales integer,
  max_rubros integer,
  max_monthly_bookings integer,
  ai_credits_monthly integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner(p_business_id)) THEN
    RAISE EXCEPTION 'forbidden entitlement snapshot for business %', p_business_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    bs.business_id,
    bs.tenant_id,
    bs.status,
    p.code,
    COALESCE(p.max_locales, 1),
    COALESCE(p.max_rubros, 1),
    p.max_monthly_bookings,
    COALESCE(p.ai_credits_monthly, 0)
  FROM public.business_subscriptions bs
  LEFT JOIN public.plan_aliases pa ON pa.alias = upper(btrim(bs.plan_code))
  JOIN public.plans p ON p.code = COALESCE(pa.plan_code, upper(btrim(bs.plan_code)))
  WHERE bs.business_id = p_business_id
    AND bs.tenant_id = p_tenant_id
    AND bs.status IN ('active', 'trialing')
  ORDER BY bs.updated_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;

COMMIT;
