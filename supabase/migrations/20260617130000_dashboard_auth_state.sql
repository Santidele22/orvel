-- Secure dashboard auth gate: dashboard access is authorized from server-controlled onboarding state.
BEGIN;

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
  v_business_type text := NULLIF(lower(btrim(COALESCE(p_business_type, ''))), '');
  v_catalog_business_type text;
  -- Self-service onboarding cannot materialize paid plans from caller input.
  -- Paid plan activation must come from trusted subscription/payment state in a separate flow.
  v_plan_code text := 'FREE';
  v_slug_base text;
  v_slug text;
  v_slug_attempts integer := 0;
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

  IF char_length(v_business_name) > 120 THEN
    RAISE EXCEPTION 'business_name is too long to complete onboarding' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_business_type) > 64 THEN
    RAISE EXCEPTION 'business_type is too long to complete onboarding' USING ERRCODE = '22023';
  END IF;

  SELECT bt.code
    INTO v_catalog_business_type
  FROM public.business_types bt
  LEFT JOIN public.business_type_aliases bta
    ON bta.business_type_code = bt.code
  WHERE bt.is_active = true
    AND (bt.code = v_business_type OR bta.alias = v_business_type)
  ORDER BY CASE WHEN bt.code = v_business_type THEN 0 ELSE 1 END, bt.sort_order ASC, bt.code ASC
  LIMIT 1;

  IF v_catalog_business_type IS NULL THEN
    RAISE EXCEPTION 'business_type is not available in the active catalog' USING ERRCODE = '22023';
  END IF;

  v_business_type := v_catalog_business_type;
  v_slug_base := COALESCE(NULLIF(public.canonical_booking_slug(v_business_name), ''), 'mi-negocio');

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

  LOOP
    v_slug_attempts := v_slug_attempts + 1;
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    BEGIN
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

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_slug_attempts >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

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
    'business_type', v_business_type,
    'business_id', v_business_id,
    'business_name', v_business_name,
    'booking_slug', v_slug
  ),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'orvel_onboarding_completed', true,
    'orvel_dashboard_ready', true,
    'orvel_plan', v_plan_code,
    'orvel_business_type', v_business_type,
    'orvel_business_id', v_business_id,
    'orvel_business_name', v_business_name,
    'orvel_booking_slug', v_slug
  ),
  updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'business_id', v_business_id,
    'business_name', v_business_name,
    'booking_slug', v_slug,
    'slug', v_slug,
    'plan', v_plan_code,
    'business_type', v_business_type,
    'dashboard_ready', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_auth_state()
RETURNS TABLE (
  dashboard_ready boolean,
  selected_plan_code text,
  business_type text,
  business_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'get_dashboard_auth_state requires an authenticated user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    bos.dashboard_ready_at IS NOT NULL OR bos.current_step = 'dashboard_ready' AS dashboard_ready,
    bos.selected_plan_code,
    bos.business_type,
    bos.business_id
  FROM public.business_onboarding_state bos
  JOIN public.businesses b ON b.id = bos.business_id
  WHERE bos.account_user_id = v_user_id
    AND b.owner_id = v_user_id
  ORDER BY bos.dashboard_ready_at DESC NULLS LAST, bos.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_auth_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_auth_state() TO authenticated, service_role;

COMMIT;
