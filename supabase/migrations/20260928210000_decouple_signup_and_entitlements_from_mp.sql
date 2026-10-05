-- Decouple signup onboarding and entitlement reads from the Mercado Pago tables.
--
-- Mercado Pago is being removed. The nine provider tables (business_subscriptions,
-- subscription_events, subscription_payments, payment_webhook_events,
-- billing_checkout_sessions, billing_reconciliation_runs, mp_plan_catalog,
-- pending_signup_intents, account_first_intents) are dropped in a follow-up
-- migration, but five live objects still read them and would break at runtime:
--
--   * public.get_business_entitlements_snapshot(text, text)        -> business_subscriptions
--   * public.get_business_entitlements_snapshot(uuid, uuid)        -> business_subscriptions
--   * public.provision_default_services_for_business(uuid, text[]) -> business_subscriptions
--   * public.complete_signup_onboarding(text, text, text, uuid)    -> pending_signup_intents
--   * public.consume_signup_email_confirmation(text)               -> pending_signup_intents
--   * trigger trg_enqueue_premium_activated_email -> business_subscriptions
--
-- Surviving sources of truth, verified against the QA project (orvel-qa-dev) on
-- 2026-09-28:
--
--   * plan          -> public.business_settings.plan (lower case, e.g. 'free'),
--                      canonicalised through public.plan_aliases/public.plans for
--                      the uuid overload and through public.plan_entitlements for
--                      the text overload (each overload keeps its original matrix).
--   * tenant/account -> coalesce(public.business_onboarding_state.account_user_id,
--                      public.businesses.owner_id). account_user_id is the live
--                      column that replaced business_subscriptions.tenant_id: in QA
--                      it equals tenant_id for every one of the 14 subscription rows,
--                      while businesses.owner_id is NULL for 11 of 15 businesses, so
--                      owner_id alone is not a usable tenant key.
--   * signup tenant  -> public.businesses.owner_id (the materialised business is the
--                      durable artifact pending_signup_intents.business_id pointed at).
--
-- Known, deliberate behaviour deltas (no other divergence is expected):
--   * subscription_status is now always 'active' for both overloads. The MP trial
--     state disappears with the provider: the uuid overload already collapsed an
--     expired trial to 'active' lazily, and the text overload loses the 'trialing'
--     literal it used to echo from a stale, already-expired MP row.
--   * The text overload now reports the live plan (business_settings.plan) instead of
--     business_subscriptions.plan_code. For the three QA rows whose expired MP trial
--     said PREMIUM while business_settings.plan = 'free', the snapshot returns
--     FREE / active / max_monthly_bookings = 30 (consistent with what the uuid
--     overload already returned for the same businesses).
--   * paid_signup email confirmations can no longer be claimed, because the paid
--     pending-signup handoff dies with the provider. That matches the current
--     observable outcome: pending_signup_intents is empty, so the old EXISTS() guard
--     already refused every paid_signup token.
--
-- Audit reference: docs/audits/2026-09-28-dev-code-audit.md (A-14 keeps the
-- authenticated-only EXECUTE grant on the text overload; tenant scoping is
-- preserved by the coalesce() above).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Migrate the effective plan out of business_subscriptions before anything
--    starts reading business_settings.plan. This is the only moment left to move
--    the data: the provider tables are dropped in the next migration.
--
--    The copy reproduces the plan the old readers served:
--      * the most recent active/trialing row per business wins (same ordering as
--        the provisioning override: updated_at DESC NULLS LAST, created_at DESC),
--      * an expired trial (status = 'trialing' with current_period_end <= now())
--        lands as 'free', which is what the uuid overload already returned lazily,
--      * rows whose plan already matches are not touched, so this is a no-op on QA
--        (verified: 15/15 business_settings rows keep plan = 'free').
--
--    It runs before the premium-email trigger is moved onto business_settings, so
--    the copy cannot enqueue any notification.
-- ---------------------------------------------------------------------------
WITH latest_subscription AS (
  SELECT DISTINCT ON (bs.business_id)
    bs.business_id,
    lower(btrim(
      CASE
        WHEN bs.status = 'trialing'
          AND bs.current_period_end IS NOT NULL
          AND bs.current_period_end <= now()
          THEN 'FREE'
        ELSE bs.plan_code
      END
    )) AS effective_plan
  FROM public.business_subscriptions bs
  WHERE COALESCE(bs.subscription_status, bs.status) IN ('active', 'trialing')
    AND bs.plan_code IS NOT NULL
  ORDER BY bs.business_id, bs.updated_at DESC NULLS LAST, bs.created_at DESC NULLS LAST
)
UPDATE public.business_settings bset
SET plan = ls.effective_plan,
    updated_at = now()
FROM latest_subscription ls
WHERE ls.business_id = bset.business_id
  AND upper(btrim(COALESCE(bset.plan, ''))) IS DISTINCT FROM upper(ls.effective_plan);

-- ---------------------------------------------------------------------------
-- 1) public.get_business_entitlements_snapshot(text, text)
--    Production signature: the dashboard calls it with the named arguments
--    business_id/tenant_id, so it is this overload PostgREST resolves.
--    Returns the same SETOF public.business_entitlements_snapshot shape.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_business_entitlements_snapshot(business_id text, tenant_id text)
RETURNS SETOF public.business_entitlements_snapshot
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  select
    bs.business_id::text,
    $2::text,
    coalesce(pa.plan_code, upper(btrim(bs.plan))),
    'active'::text,
    pe.max_locales,
    pe.max_rubros,
    pe.max_monthly_bookings,
    pe.ai_credits_monthly
  from public.business_settings bs
  join public.businesses b
    on b.id = bs.business_id
  left join public.business_onboarding_state bos
    on bos.business_id = bs.business_id
  left join public.plan_aliases pa
    on pa.alias = upper(btrim(bs.plan))
  join public.plan_entitlements pe
    on pe.plan_code = coalesce(pa.plan_code, upper(btrim(bs.plan)))
  where bs.business_id::text = $1
    and coalesce(bos.account_user_id, b.owner_id)::text = $2
  limit 1;
$$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) public.get_business_entitlements_snapshot(uuid, uuid)
--    Same authorization guard, same add-on math, same matrix (public.plans +
--    public.plan_aliases), same return shape. Only the plan/tenant source and the
--    implicit trial state change.
-- ---------------------------------------------------------------------------
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
  current_plan AS (
    SELECT
      bs.business_id,
      bs.plan
    FROM public.business_settings bs
    JOIN public.businesses b
      ON b.id = bs.business_id
    LEFT JOIN public.business_onboarding_state bos
      ON bos.business_id = bs.business_id
    WHERE bs.business_id = p_business_id
      AND coalesce(bos.account_user_id, b.owner_id) = p_tenant_id
    LIMIT 1
  )
  SELECT
    cp.business_id,
    p_tenant_id,
    'active'::text,
    p.code,
    COALESCE(p.max_locales, 1) + COALESCE(aa.extra_locales, 0),
    COALESCE(p.max_rubros, 1),
    p.max_monthly_bookings,
    COALESCE(p.ai_credits_monthly, 0)
  FROM current_plan cp
  LEFT JOIN public.plan_aliases pa
    ON pa.alias = upper(btrim(cp.plan))
  JOIN public.plans p
    ON p.code = COALESCE(pa.plan_code, upper(btrim(cp.plan)))
  LEFT JOIN active_addons aa ON aa.business_id = cp.business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) public.provision_default_services_for_business(uuid, text[])
--    Body unchanged except for the removed business_subscriptions override:
--    business_settings.plan (via plan_aliases) is now the only plan source, which
--    is also what the first half of the original lookup already used. The override
--    was inconsistent anyway - unlike the snapshot it ignored trial expiry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_default_services_for_business(p_business_id uuid, p_business_types text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inserted_count integer := 0;
  v_plan_code text := 'FREE';
  v_max_rubros integer := 1;
  v_selected_business_types text[] := ARRAY[]::text[];
  v_requested_count integer := 0;
BEGIN
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_id is required to provision default services' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner(p_business_id)) THEN
    RAISE EXCEPTION 'forbidden default service provisioning for business %', p_business_id USING ERRCODE = '42501';
  END IF;

  WITH requested AS (
    SELECT lower(btrim(value)) AS raw_code, ordinality
    FROM unnest(COALESCE(p_business_types, ARRAY[]::text[])) WITH ORDINALITY AS input(value, ordinality)
    WHERE NULLIF(btrim(value), '') IS NOT NULL
  ), normalized AS (
    SELECT DISTINCT ON (bt.code)
      bt.code AS business_type_code,
      requested.ordinality
    FROM requested
    JOIN public.business_types bt ON bt.is_active = true
    LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
    WHERE bt.code = requested.raw_code OR bta.alias = requested.raw_code
    ORDER BY bt.code, requested.ordinality
  )
  SELECT count(*) INTO v_requested_count FROM normalized;

  IF v_requested_count = 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(pa.plan_code, upper(btrim(COALESCE(bs.plan, 'FREE')))),
         CASE
           WHEN cardinality(COALESCE(bs.selected_business_types, ARRAY[]::text[])) > 0
             THEN bs.selected_business_types
           WHEN NULLIF(btrim(COALESCE(bs.business_type, '')), '') IS NOT NULL
             THEN ARRAY[lower(btrim(bs.business_type))]
           ELSE ARRAY[]::text[]
         END
    INTO v_plan_code, v_selected_business_types
  FROM public.business_settings bs
  LEFT JOIN public.plan_aliases pa ON pa.alias = upper(btrim(COALESCE(bs.plan, 'FREE')))
  WHERE bs.business_id = p_business_id;

  v_plan_code := COALESCE(NULLIF(v_plan_code, ''), 'FREE');

  SELECT COALESCE(p.max_rubros, 1)
    INTO v_max_rubros
  FROM public.plans p
  WHERE p.code = v_plan_code
    AND p.is_active = true;

  v_max_rubros := COALESCE(v_max_rubros, 1);

  IF v_requested_count > v_max_rubros THEN
    RAISE EXCEPTION 'default service provisioning exceeds max_rubros entitlement for business %', p_business_id USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    WITH requested AS (
      SELECT lower(btrim(value)) AS raw_code, ordinality
      FROM unnest(COALESCE(p_business_types, ARRAY[]::text[])) WITH ORDINALITY AS input(value, ordinality)
      WHERE NULLIF(btrim(value), '') IS NOT NULL
    ), normalized AS (
      SELECT DISTINCT ON (bt.code) bt.code AS business_type_code
      FROM requested
      JOIN public.business_types bt ON bt.is_active = true
      LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
      WHERE bt.code = requested.raw_code OR bta.alias = requested.raw_code
      ORDER BY bt.code, requested.ordinality
    )
    SELECT 1
    FROM normalized n
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.plan_business_types pbt
      WHERE pbt.plan_code = v_plan_code
        AND pbt.business_type_code = n.business_type_code
    )
  ) THEN
    RAISE EXCEPTION 'default service provisioning contains rubros unavailable for plan %', v_plan_code USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role' AND EXISTS (
    WITH requested AS (
      SELECT lower(btrim(value)) AS raw_code, ordinality
      FROM unnest(COALESCE(p_business_types, ARRAY[]::text[])) WITH ORDINALITY AS input(value, ordinality)
      WHERE NULLIF(btrim(value), '') IS NOT NULL
    ), normalized AS (
      SELECT DISTINCT ON (bt.code) bt.code AS business_type_code
      FROM requested
      JOIN public.business_types bt ON bt.is_active = true
      LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
      WHERE bt.code = requested.raw_code OR bta.alias = requested.raw_code
      ORDER BY bt.code, requested.ordinality
    ), selected AS (
      SELECT DISTINCT lower(btrim(value)) AS business_type_code
      FROM unnest(COALESCE(v_selected_business_types, ARRAY[]::text[])) AS input(value)
      WHERE NULLIF(btrim(value), '') IS NOT NULL
    )
    SELECT 1
    FROM normalized n
    WHERE NOT EXISTS (
      SELECT 1
      FROM selected s
      WHERE s.business_type_code = n.business_type_code
    )
  ) THEN
    RAISE EXCEPTION 'default service provisioning contains rubros not selected for business %', p_business_id USING ERRCODE = '42501';
  END IF;

  WITH requested AS (
    SELECT lower(btrim(value)) AS raw_code, ordinality
    FROM unnest(COALESCE(p_business_types, ARRAY[]::text[])) WITH ORDINALITY AS input(value, ordinality)
    WHERE NULLIF(btrim(value), '') IS NOT NULL
  ), normalized AS (
    SELECT DISTINCT ON (bt.code)
      bt.code AS business_type_code,
      requested.ordinality
    FROM requested
    JOIN public.business_types bt ON bt.is_active = true
    LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
    WHERE bt.code = requested.raw_code OR bta.alias = requested.raw_code
    ORDER BY bt.code, requested.ordinality
  ), candidates AS (
    SELECT DISTINCT ON (lower(btrim(defaults.name)), lower(btrim(defaults.category)))
      defaults.id AS default_service_id,
      defaults.business_type_code,
      defaults.name,
      defaults.description,
      defaults.category,
      defaults.duration_minutes,
      defaults.price,
      defaults.sort_order,
      normalized.ordinality
    FROM normalized
    JOIN public.business_type_default_services defaults
      ON defaults.business_type_code = normalized.business_type_code
    WHERE defaults.is_active = true
    ORDER BY lower(btrim(defaults.name)), lower(btrim(defaults.category)), normalized.ordinality, defaults.sort_order, defaults.id
  ), inserted AS (
    INSERT INTO public.services (
      business_id,
      name,
      description,
      category,
      duration_minutes,
      price,
      is_active,
      default_service_id,
      provisioned_from_business_type,
      provisioned_at
    )
    SELECT
      p_business_id,
      candidates.name,
      candidates.description,
      candidates.category,
      candidates.duration_minutes,
      candidates.price,
      true,
      candidates.default_service_id,
      candidates.business_type_code,
      now()
    FROM candidates
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.services existing
      WHERE existing.business_id = p_business_id
        AND lower(btrim(existing.name)) = lower(btrim(candidates.name))
        AND lower(btrim(COALESCE(existing.category, ''))) = lower(btrim(candidates.category))
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted_count FROM inserted;

  RETURN v_inserted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.provision_default_services_for_business(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_default_services_for_business(uuid, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) public.complete_signup_onboarding(text, text, text, uuid)
--    Body unchanged except for the removed pending_signup_intents lookup. That
--    lookup only ever resolved the business materialised by the Mercado Pago paid
--    handoff; the surviving lookup (the owner's first business) plus the user-id
--    fallback are untouched, and pending_signup_intents was empty in QA.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_signup_onboarding(p_business_name text, p_business_type text, p_plan_code text DEFAULT 'FREE'::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_business_id uuid;
  v_business_name text := NULLIF(btrim(COALESCE(p_business_name, '')), '');
  v_business_type text := NULLIF(lower(btrim(COALESCE(p_business_type, ''))), '');
  v_catalog_business_type text;
  v_default_services_count integer := 0;
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

  SELECT bt.code INTO v_catalog_business_type
  FROM public.business_types bt
  LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
  WHERE bt.is_active = true
    AND (bt.code = v_business_type OR bta.alias = v_business_type)
  ORDER BY CASE WHEN bt.code = v_business_type THEN 0 ELSE 1 END, bt.sort_order ASC, bt.code ASC
  LIMIT 1;

  IF v_catalog_business_type IS NULL THEN
    RAISE EXCEPTION 'business_type is not available in the active catalog' USING ERRCODE = '22023';
  END IF;

  v_business_type := v_catalog_business_type;
  v_slug_base := COALESCE(NULLIF(public.canonical_booking_slug(v_business_name), ''), 'mi-negocio');

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.owner_id = v_user_id
  ORDER BY b.created_at ASC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    v_business_id := v_user_id;
  END IF;

  LOOP
    v_slug_attempts := v_slug_attempts + 1;
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    BEGIN
      INSERT INTO public.businesses(id, slug, name, timezone, owner_id)
      VALUES (v_business_id, v_slug, v_business_name, 'America/Argentina/Buenos_Aires', v_user_id)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        timezone = EXCLUDED.timezone,
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
    plan,
    business_type,
    capacity,
    buffer_minutes,
    min_notice_minutes,
    slot_interval_minutes,
    updated_at
  )
  VALUES (v_business_id, lower(v_plan_code), v_business_type, 1, 15, 120, 30, now())
  ON CONFLICT (business_id) DO UPDATE SET
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
  VALUES (v_business_id, 'dashboard_ready', v_plan_code, v_user_id, v_business_type, now(), now())
  ON CONFLICT (business_id) DO UPDATE SET
    current_step = 'dashboard_ready',
    selected_plan_code = EXCLUDED.selected_plan_code,
    account_user_id = EXCLUDED.account_user_id,
    business_type = EXCLUDED.business_type,
    dashboard_ready_at = now(),
    updated_at = now();

  SELECT public.provision_default_services_for_business(v_business_id, ARRAY[v_business_type])
    INTO v_default_services_count;

  INSERT INTO public.onboarding_events(business_id, step, metadata)
  VALUES (
    v_business_id,
    'dashboard_ready',
    jsonb_build_object('plan', v_plan_code, 'business_type', v_business_type, 'default_services_provisioned', v_default_services_count)
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
    'default_services_provisioned', v_default_services_count,
    'dashboard_ready', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) public.consume_signup_email_confirmation(text)
--    Same claim rules and same return shape. The paid_signup branch dies with the
--    provider: `purpose <> 'paid_signup'` reproduces the old EXISTS() guard exactly,
--    because pending_signup_intents is empty and nothing can insert into it again.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_signup_email_confirmation(p_token_hash text)
 RETURNS TABLE(confirmation_id uuid, purpose text, plan_code text, billing_period text, email_hmac text, protected_metadata jsonb, email_encrypted text, first_name_encrypted text, first_name_hmac text, last_name_encrypted text, last_name_hmac text, business_name_encrypted text, business_name_hmac text, phone_encrypted text, phone_hmac text, pii_crypto_version text, pending_signup_reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'consume_signup_email_confirmation is service-role only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.signup_email_confirmations sec
    SET status = 'materializing',
        consumed_at = now(),
        updated_at = now()
    WHERE sec.token_hash = p_token_hash
      AND sec.status = 'pending'
      AND sec.consumed_at IS NULL
      AND sec.expires_at > now()
      AND sec.purpose <> 'paid_signup'
    RETURNING sec.id, sec.purpose, sec.plan_code, sec.billing_period, sec.email_hmac, sec.protected_metadata,
      sec.email_encrypted, sec.first_name_encrypted, sec.first_name_hmac, sec.last_name_encrypted, sec.last_name_hmac,
      sec.business_name_encrypted, sec.business_name_hmac, sec.phone_encrypted, sec.phone_hmac, sec.pii_crypto_version,
      sec.pending_signup_reference
  )
  SELECT c.id, c.purpose, c.plan_code, c.billing_period, c.email_hmac, c.protected_metadata,
    c.email_encrypted, c.first_name_encrypted, c.first_name_hmac, c.last_name_encrypted, c.last_name_hmac,
    c.business_name_encrypted, c.business_name_hmac, c.phone_encrypted, c.phone_hmac, c.pii_crypto_version,
    c.pending_signup_reference
  FROM claimed c;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_signup_email_confirmation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_signup_email_confirmation(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Premium activated email
--    The plan now changes in public.business_settings.plan (lower case), so the
--    trigger moves there. enqueue_premium_activated_email() keeps the same
--    guards (only UPDATE, only a non-PREMIUM -> PREMIUM transition, only once per
--    7 days), the same recipient lookup and the same fail-soft EXCEPTION handler;
--    only the column it reads changes. Alias plan values (e.g. 'pro' -> PREMIUM)
--    do NOT fire, mirroring the strict literal comparison of the old trigger.
--    The trigger is removed from business_subscriptions, which is dropped later.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_premium_activated_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_business_id uuid;
  v_email text;
  v_owner_name text;
  v_business_name text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.plan, '')) <> 'PREMIUM' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(OLD.plan, '')) = 'PREMIUM' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_business_id := NEW.business_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  SELECT
    b.name,
    u.email,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
  INTO v_business_name, v_email, v_owner_name
  FROM public.businesses b
  LEFT JOIN auth.users u ON u.id = b.owner_id
  LEFT JOIN public.profiles p ON p.id = b.owner_id
  WHERE b.id = v_business_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_email_outbox neo
    WHERE neo.business_id = v_business_id
      AND neo.template_key = 'premium_activated'
      AND neo.created_at > now() - interval '7 days'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_email_outbox (business_id, to_email, template_key, payload)
  VALUES (
    v_business_id,
    v_email,
    'premium_activated',
    jsonb_build_object(
      'business_name', coalesce(v_business_name, 'Tu negocio'),
      'owner_name', coalesce(v_owner_name, 'Propietario')
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_premium_activated_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enqueue_premium_activated_email ON public.business_subscriptions;
DROP TRIGGER IF EXISTS trg_enqueue_premium_activated_email ON public.business_settings;
CREATE TRIGGER trg_enqueue_premium_activated_email
  AFTER UPDATE OF plan ON public.business_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_premium_activated_email();


-- `business_settings.plan` becomes authoritative with this migration: before it,
-- only `business_subscriptions` drove entitlements, so a self-service UPDATE of
-- `plan` was inert. Now it decides what the business can do, and RLS grants the
-- owner UPDATE on the row (with no CHECK or default on this column), so an owner
-- could escalate to premium straight through PostgREST.
--
-- A column-level REVOKE does not help here: `authenticated` holds UPDATE on the
-- whole table, and a table-level privilege already covers every column. The gate
-- is a trigger instead, keyed on the JWT role, so administrators (service_role,
-- SQL, migrations) keep working while browser clients cannot change the plan.
CREATE OR REPLACE FUNCTION public.prevent_self_service_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'PLAN_CHANGE_REQUIRES_ADMIN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_service_plan_change ON public.business_settings;
CREATE TRIGGER trg_prevent_self_service_plan_change
  BEFORE UPDATE OF plan ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_service_plan_change();

COMMIT;

NOTIFY pgrst, 'reload schema';
