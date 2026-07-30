-- Launch signup backend contract: complete onboarding after free auth or paid MP materialization.
BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS business_type text;

CREATE OR REPLACE FUNCTION public.complete_signup_onboarding(
  p_business_name text,
  p_business_type text,
  p_plan_code text DEFAULT 'FREE',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_business_id uuid;
  v_business_name text := NULLIF(btrim(COALESCE(p_business_name, '')), '');
  v_business_type text := NULLIF(btrim(COALESCE(p_business_type, '')), '');
  v_plan_code text := upper(NULLIF(btrim(COALESCE(p_plan_code, 'FREE')), ''));
  v_slug_base text;
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'complete_signup_onboarding requires an authenticated user' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role' AND v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'complete_signup_onboarding cannot write another user onboarding state' USING ERRCODE = '42501';
  END IF;

  IF v_business_type IS NULL THEN
    RAISE EXCEPTION 'business_type is required to complete onboarding' USING ERRCODE = '22023';
  END IF;

  v_business_name := COALESCE(v_business_name, 'Mi Negocio');
  v_plan_code := COALESCE(v_plan_code, 'FREE');
  v_slug_base := lower(v_business_name);
  v_slug_base := regexp_replace(v_slug_base, '[^a-z0-9]+', '-', 'g');
  v_slug_base := trim(both '-' from v_slug_base);
  v_slug := COALESCE(NULLIF(v_slug_base, ''), 'mi-negocio') || '-' || left(v_user_id::text, 8);

  SELECT psi.business_id
    INTO v_business_id
  FROM public.pending_signup_intents psi
  WHERE psi.user_id = v_user_id
    AND psi.status = 'materialized'
    AND psi.business_id IS NOT NULL
  ORDER BY psi.materialized_at DESC NULLS LAST, psi.updated_at DESC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    SELECT b.id
      INTO v_business_id
    FROM public.businesses b
    WHERE b.owner_id = v_user_id
    ORDER BY b.created_at ASC
    LIMIT 1;
  END IF;

  IF v_business_id IS NULL THEN
    v_business_id := v_user_id;
  END IF;

  INSERT INTO public.businesses(id, slug, name, timezone, capacity, owner_id)
  VALUES (
    v_business_id,
    v_slug,
    v_business_name,
    'America/Argentina/Buenos_Aires',
    1,
    v_user_id
  )
  ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    timezone = EXCLUDED.timezone,
    capacity = GREATEST(COALESCE(public.businesses.capacity, 1), 1),
    owner_id = EXCLUDED.owner_id;

  INSERT INTO public.business_settings(
    business_id,
    business_name,
    slug,
    plan,
    business_type,
    capacity,
    buffer_minutes,
    min_notice_minutes,
    slot_interval_minutes,
    updated_at
  )
  VALUES (
    v_business_id,
    v_business_name,
    v_slug,
    lower(v_plan_code),
    v_business_type,
    1,
    15,
    120,
    30,
    now()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    slug = EXCLUDED.slug,
    plan = EXCLUDED.plan,
    business_type = EXCLUDED.business_type,
    capacity = GREATEST(COALESCE(public.business_settings.capacity, 1), 1),
    buffer_minutes = EXCLUDED.buffer_minutes,
    min_notice_minutes = EXCLUDED.min_notice_minutes,
    slot_interval_minutes = EXCLUDED.slot_interval_minutes,
    updated_at = now();

  INSERT INTO public.business_onboarding_state(
    business_id,
    current_step,
    selected_plan_code,
    account_user_id,
    business_type,
    dashboard_ready_at,
    updated_at
  )
  VALUES (
    v_business_id,
    'dashboard_ready',
    v_plan_code,
    v_user_id,
    v_business_type,
    now(),
    now()
  )
  ON CONFLICT (business_id) DO UPDATE SET
    current_step = 'dashboard_ready',
    selected_plan_code = EXCLUDED.selected_plan_code,
    account_user_id = EXCLUDED.account_user_id,
    business_type = EXCLUDED.business_type,
    dashboard_ready_at = now(),
    updated_at = now();

  INSERT INTO public.onboarding_events(business_id, step, metadata)
  VALUES (
    v_business_id,
    'dashboard_ready',
    jsonb_build_object('plan', v_plan_code, 'business_type', v_business_type)
  )
  ON CONFLICT (business_id, step) DO NOTHING;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'onboardingCompleted', true,
    'onboarding_completed', true,
    'onboarding_required', false,
    'plan', v_plan_code,
    'tipoNegocio', v_business_type,
    'businessType', v_business_type,
    'business_type', v_business_type
  ),
  updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'business_id', v_business_id,
    'plan', v_plan_code,
    'business_type', v_business_type,
    'dashboard_ready', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) TO authenticated, service_role;

COMMIT;
