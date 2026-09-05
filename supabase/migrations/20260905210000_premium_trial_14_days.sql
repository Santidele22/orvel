-- 14-day Premium trial. Entitlements expire lazily in get_business_entitlements_snapshot.
BEGIN;

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS premium_trial_used_at timestamptz;

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
  WITH active_addons AS (
    SELECT
      ba.business_id,
      COALESCE(SUM(ba.quantity * ac.max_locales_increment), 0)::integer AS extra_locales
    FROM public.business_addons ba
    JOIN public.addon_catalog ac ON ac.code IN (upper(btrim(ba.addon_code)), 'MULTI_BRANCH')
      AND ac.code = 'MULTI_BRANCH'
      AND ac.is_active = true
    WHERE ba.business_id = p_business_id
      AND ba.active = true
      AND upper(btrim(ba.addon_code)) IN ('MULTI_BRANCH', 'EXTRA_BRANCH')
    GROUP BY ba.business_id
  ),
  current_sub AS (
    SELECT
      bs.business_id,
      bs.tenant_id,
      bs.status,
      bs.plan_code,
      bs.updated_at,
      (
        bs.status = 'trialing'
        AND bs.current_period_end IS NOT NULL
        AND bs.current_period_end <= now()
      ) AS trial_expired
    FROM public.business_subscriptions bs
    WHERE bs.business_id = p_business_id
      AND bs.tenant_id = p_tenant_id
      AND bs.status IN ('active', 'trialing')
    ORDER BY bs.updated_at DESC
    LIMIT 1
  )
  SELECT
    cs.business_id,
    cs.tenant_id,
    CASE WHEN cs.trial_expired THEN 'active' ELSE cs.status END,
    p.code,
    COALESCE(p.max_locales, 1) + COALESCE(aa.extra_locales, 0),
    COALESCE(p.max_rubros, 1),
    p.max_monthly_bookings,
    COALESCE(p.ai_credits_monthly, 0)
  FROM current_sub cs
  LEFT JOIN public.plan_aliases pa
    ON pa.alias = upper(btrim(CASE WHEN cs.trial_expired THEN 'FREE' ELSE cs.plan_code END))
  JOIN public.plans p
    ON p.code = COALESCE(pa.plan_code, upper(btrim(CASE WHEN cs.trial_expired THEN 'FREE' ELSE cs.plan_code END)))
  LEFT JOIN active_addons aa ON aa.business_id = cs.business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_premium_trial(p_business_id uuid)
RETURNS TABLE (
  business_id uuid,
  tenant_id uuid,
  plan_code text,
  status text,
  subscription_status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  premium_trial_used_at timestamptz,
  outcome text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.business_subscriptions%ROWTYPE;
  v_sub_id uuid;
  v_plan text;
  v_now timestamptz := now();
  v_outcome text;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner(p_business_id)) THEN
    RAISE EXCEPTION 'forbidden premium trial start for business %', p_business_id USING ERRCODE = '42501';
  END IF;

  SELECT bs.id
  INTO v_sub_id
  FROM public.business_subscriptions bs
  JOIN public.businesses b ON b.id = bs.business_id
  WHERE bs.business_id = p_business_id
    AND bs.tenant_id = b.owner_id
  ORDER BY bs.updated_at DESC
  LIMIT 1;

  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'subscription not found for business %', p_business_id USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_sub
  FROM public.business_subscriptions
  WHERE id = v_sub_id
  FOR UPDATE;

  v_plan := COALESCE(
    (
      SELECT pa.plan_code
      FROM public.plan_aliases pa
      WHERE pa.alias = upper(btrim(v_sub.plan_code))
      LIMIT 1
    ),
    upper(btrim(v_sub.plan_code))
  );

  IF v_plan = 'PREMIUM' AND v_sub.status = 'active' THEN
    v_outcome := 'already_premium';
  ELSIF v_plan = 'PREMIUM'
    AND v_sub.status = 'trialing'
    AND (v_sub.current_period_end IS NULL OR v_sub.current_period_end > v_now) THEN
    v_outcome := 'already_trialing';
  ELSIF v_sub.premium_trial_used_at IS NOT NULL THEN
    v_outcome := 'trial_already_used';
  ELSE
    UPDATE public.business_subscriptions
    SET
      plan_code = 'PREMIUM',
      status = 'trialing',
      subscription_status = 'trialing',
      current_period_start = v_now,
      current_period_end = v_now + interval '14 days',
      premium_trial_used_at = v_now,
      provider = 'manual',
      updated_at = v_now
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;
    v_outcome := 'started';
  END IF;

  RETURN QUERY SELECT
    v_sub.business_id,
    v_sub.tenant_id,
    v_sub.plan_code,
    v_sub.status,
    v_sub.subscription_status,
    v_sub.current_period_start,
    v_sub.current_period_end,
    v_sub.premium_trial_used_at,
    v_outcome;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_premium_trial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_premium_trial(uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
