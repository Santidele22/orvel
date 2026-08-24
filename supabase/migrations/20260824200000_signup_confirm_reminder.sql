-- Enqueue a 48h signup email confirmation reminder without changing outbox transport.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_signup_email_verification_actions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'enqueue_signup_email_verification_actions is service-role only'
      USING ERRCODE = '42501';
  END IF;

  WITH due AS (
    SELECT
      bos.business_id,
      u.email AS to_email,
      COALESCE(orig.payload ->> 'confirmation_url', '') AS confirmation_url,
      NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') AS owner_name,
      b.name AS business_name,
      COALESCE(bos.selected_plan_code, 'FREE') AS plan_code
    FROM public.business_onboarding_state bos
    JOIN public.businesses b ON b.id = bos.business_id
    JOIN auth.users u ON u.id = COALESCE(bos.account_user_id, b.owner_id)
    LEFT JOIN public.profiles p ON p.id = u.id
    LEFT JOIN LATERAL (
      SELECT neo.payload
      FROM public.notification_email_outbox neo
      WHERE neo.template_key = 'signup_email_confirmation'
        AND neo.to_email = u.email
      ORDER BY neo.created_at DESC
      LIMIT 1
    ) orig ON true
    WHERE bos.email_confirmed_at IS NULL
      AND bos.dashboard_ready_at IS NOT NULL
      AND bos.dashboard_ready_at <= now() - interval '48 hours'
      AND NULLIF(btrim(u.email), '') IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.notification_email_outbox (
      business_id,
      to_email,
      template_key,
      payload,
      lifecycle_event_key
    )
    SELECT
      due.business_id,
      due.to_email,
      'signup_email_confirmation_reminder',
      jsonb_build_object(
        'confirmation_url', due.confirmation_url,
        'owner_name', due.owner_name,
        'business_name', due.business_name,
        'plan_code', due.plan_code
      ),
      'signup-confirm-reminder:' || due.business_id::text
    FROM due
    ON CONFLICT (lifecycle_event_key) WHERE lifecycle_event_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_signup_email_verification_actions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_signup_email_verification_actions() FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_signup_email_verification_actions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_signup_email_verification_actions() TO service_role;

COMMIT;
