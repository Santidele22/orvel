-- Platform operator Premium queue (#619).
-- Privilege is Auth app_metadata.role = platform_operator (never user_metadata).
-- Premium-activated email: trg_enqueue_premium_activated_email listens to
-- UPDATE OF plan_code on business_subscriptions. Approve updates plan_code so
-- that path can fire. INSERT-only PREMIUM would miss it; new rows are inserted
-- as FREE then updated to PREMIUM. No new mail table.
-- Audit: subscription_events requires tenant_id; skip rather than invent a ledger.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_operator', false);
$$;

REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_premium_requests()
RETURNS TABLE (
  request_id uuid,
  who text,
  what_they_asked text,
  status text,
  requested_at timestamptz,
  account_exists boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    psi.id,
    CASE
      WHEN b.id IS NULL THEN 'Alta pendiente'
      ELSE COALESCE(NULLIF(btrim(b.name), ''), 'Alta pendiente')
    END,
    'PREMIUM'::text,
    'pending'::text,
    psi.created_at,
    (psi.business_id IS NOT NULL)
  FROM public.pending_signup_intents psi
  LEFT JOIN public.businesses b ON b.id = psi.business_id
  WHERE upper(COALESCE(psi.plan_code, '')) IN (
      'PREMIUM', 'BASIC', 'STARTED', 'STARTER', 'MEDIUM', 'GROWTH', 'PRO', 'SIMPLE', 'CRECE', 'ESCALA'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.business_subscriptions bs
      WHERE bs.business_id = psi.business_id
        AND upper(COALESCE(bs.plan_code, '')) = 'PREMIUM'
        AND COALESCE(bs.status, '') IN ('active', 'trialing')
    )
  ORDER BY psi.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_pending_premium_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_premium_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_manual_premium(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.pending_signup_intents%ROWTYPE;
  v_subscription public.business_subscriptions%ROWTYPE;
  v_period_start timestamptz := now();
  v_period_end timestamptz := now() + interval '30 days';
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_intent
  FROM public.pending_signup_intents
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_intent.business_id IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_NOT_MATERIALIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_subscription
  FROM public.business_subscriptions
  WHERE business_id = v_intent.business_id
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_subscription.id IS NULL THEN
    INSERT INTO public.business_subscriptions (
      business_id,
      plan_code,
      status,
      provider,
      current_period_start,
      current_period_end,
      period_start,
      period_end,
      start_date,
      updated_at
    ) VALUES (
      v_intent.business_id,
      'FREE',
      'active',
      'manual',
      v_period_start,
      v_period_end,
      v_period_start,
      v_period_end,
      v_period_start,
      now()
    )
    RETURNING * INTO v_subscription;
  END IF;

  IF upper(COALESCE(v_subscription.plan_code, '')) <> 'PREMIUM'
     OR COALESCE(v_subscription.status, '') NOT IN ('active', 'trialing') THEN
    UPDATE public.business_subscriptions
    SET
      plan_code = 'PREMIUM',
      status = 'active',
      provider = COALESCE(NULLIF(provider, ''), 'manual'),
      current_period_start = COALESCE(current_period_start, v_period_start),
      current_period_end = GREATEST(COALESCE(current_period_end, v_period_end), v_period_end),
      period_start = COALESCE(period_start, v_period_start),
      period_end = GREATEST(COALESCE(period_end, v_period_end), v_period_end),
      updated_at = now()
    WHERE id = v_subscription.id;
  END IF;

  UPDATE public.pending_signup_intents
  SET
    status = CASE
      WHEN status = 'materialized' THEN status
      ELSE 'approved'
    END,
    updated_at = now()
  WHERE id = v_intent.id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_manual_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_manual_premium(uuid) TO authenticated;

COMMIT;
