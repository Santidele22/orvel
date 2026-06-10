-- P0 MVP backend contract fixes.
-- Forward-only remediation for billing cancellation columns, webhook state,
-- tenant-safe booking RPCs, and separate multi-branch add-on entitlements.

BEGIN;

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_locales integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_rubros integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_monthly_bookings integer,
  ADD COLUMN IF NOT EXISTS ai_credits_monthly integer DEFAULT 0;

UPDATE public.plans
SET max_locales = 1,
    updated_at = now()
WHERE code IN ('FREE', 'STARTER', 'GROWTH', 'PRO')
  AND COALESCE(max_locales, 1) <> 1;

UPDATE public.plan_entitlements
SET max_locales = 1,
    branch_base_limit = 1
WHERE plan_code IN ('FREE', 'BASIC', 'MEDIUM', 'PRO', 'STARTER', 'GROWTH', 'SIMPLE', 'CRECE', 'ESCALA')
  AND (
    COALESCE(max_locales, 1) <> 1
    OR COALESCE(branch_base_limit, 1) <> 1
  );

CREATE TABLE IF NOT EXISTS public.addon_catalog (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  billing_frequency integer NOT NULL DEFAULT 1,
  billing_frequency_type text NOT NULL DEFAULT 'months',
  max_locales_increment integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code = upper(btrim(code))),
  CHECK (currency = upper(btrim(currency))),
  CHECK (price >= 0),
  CHECK (max_locales_increment >= 0)
);

INSERT INTO public.addon_catalog (
  code,
  name,
  description,
  price,
  currency,
  billing_frequency,
  billing_frequency_type,
  max_locales_increment,
  is_active
)
VALUES (
  'MULTI_BRANCH',
  'Multi-branch add-on',
  'Adds one extra branch/local to the active base plan. Multi-tenant/multi-branch is billed separately from base plans.',
  20000,
  'ARS',
  1,
  'months',
  1,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  currency = EXCLUDED.currency,
  billing_frequency = EXCLUDED.billing_frequency,
  billing_frequency_type = EXCLUDED.billing_frequency_type,
  max_locales_increment = EXCLUDED.max_locales_increment,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.business_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  addon_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  amount_cents integer NOT NULL DEFAULT 2000000,
  currency text NOT NULL DEFAULT 'ARS',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, addon_code)
);

COMMENT ON TABLE public.business_addons IS
  'Supported add-on: MULTI_BRANCH / EXTRA_BRANCH at ARS 20,000/month; each quantity adds +1 branch/local beyond the base plan.';

ALTER TABLE public.addon_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read addon catalog" ON public.addon_catalog;
CREATE POLICY "Public read addon catalog" ON public.addon_catalog
  FOR SELECT USING (is_active = true);

DROP FUNCTION IF EXISTS public.get_dashboard_reference_catalog();
CREATE OR REPLACE FUNCTION public.get_dashboard_reference_catalog()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', p.code,
        'name', p.name,
        'label', p.name,
        'description', p.description,
        'price', p.price,
        'currency', p.currency,
        'is_active', p.is_active,
        'is_featured', p.is_featured,
        'max_locales', COALESCE(p.max_locales, 1),
        'max_rubros', p.max_rubros,
        'max_monthly_bookings', p.max_monthly_bookings,
        'ai_credits_monthly', p.ai_credits_monthly
      ) ORDER BY p.price ASC, p.code ASC)
      FROM public.plans p
      WHERE p.code IN ('FREE', 'STARTER', 'GROWTH', 'PRO') AND p.is_active = true
    ), '[]'::jsonb),
    'addons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', ac.code,
        'name', ac.name,
        'label', ac.name,
        'description', ac.description,
        'price', ac.price,
        'currency', ac.currency,
        'billing_frequency', ac.billing_frequency,
        'billing_frequency_type', ac.billing_frequency_type,
        'max_locales_increment', ac.max_locales_increment,
        'is_active', ac.is_active
      ) ORDER BY ac.price ASC, ac.code ASC)
      FROM public.addon_catalog ac
      WHERE ac.is_active = true
    ), '[]'::jsonb),
    'plan_aliases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('alias', pa.alias, 'plan_code', pa.plan_code) ORDER BY pa.alias ASC)
      FROM public.plan_aliases pa
    ), '[]'::jsonb),
    'business_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', bt.code,
        'label', bt.label,
        'theme_key', bt.theme_key,
        'sort_order', bt.sort_order
      ) ORDER BY bt.sort_order ASC, bt.code ASC)
      FROM public.business_types bt
      WHERE bt.is_active = true
    ), '[]'::jsonb),
    'business_type_aliases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('alias', bta.alias, 'business_type_code', bta.business_type_code) ORDER BY bta.alias ASC)
      FROM public.business_type_aliases bta
    ), '[]'::jsonb),
    'plan_business_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('plan_code', pbt.plan_code, 'business_type_code', pbt.business_type_code) ORDER BY pbt.plan_code ASC, pbt.business_type_code ASC)
      FROM public.plan_business_types pbt
    ), '[]'::jsonb)
  );
$$;

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
  )
  SELECT
    bs.business_id,
    bs.tenant_id,
    bs.status,
    p.code,
    COALESCE(p.max_locales, 1) + COALESCE(aa.extra_locales, 0),
    COALESCE(p.max_rubros, 1),
    p.max_monthly_bookings,
    COALESCE(p.ai_credits_monthly, 0)
  FROM public.business_subscriptions bs
  LEFT JOIN public.plan_aliases pa ON pa.alias = upper(btrim(bs.plan_code))
  JOIN public.plans p ON p.code = COALESCE(pa.plan_code, upper(btrim(bs.plan_code)))
  LEFT JOIN active_addons aa ON aa.business_id = bs.business_id
  WHERE bs.business_id = p_business_id
    AND bs.tenant_id = p_tenant_id
    AND bs.status IN ('active', 'trialing')
  ORDER BY bs.updated_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  business_slug text,
  service_id text,
  starts_at_iso text,
  client jsonb,
  notes text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  branch_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_branch_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
  v_manage_token text := encode(gen_random_bytes(32), 'base64url');
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  END IF;

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = business_slug OR b.slug_canonical = public.canonical_booking_slug(business_slug)
  LIMIT 1;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('BUSINESS_NOT_FOUND'); END IF;

  BEGIN
    v_service_id := service_id::uuid;
    v_branch_id := nullif(btrim(branch_id), '')::uuid;
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF v_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = v_branch_id
        AND br.business_id = v_business_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
    END IF;
  END IF;

  SELECT s.duration_minutes INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id
    AND s.business_id = v_business_id
    AND COALESCE(s.is_active, true) = true;
  IF v_duration_minutes IS NULL THEN PERFORM public._raise_rpc('INVALID_SERVICE'); END IF;
  IF nullif(btrim(client->>'fullName'), '') IS NULL THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, btrim(client->>'fullName'), NULLIF(btrim(client->>'email'), ''), NULLIF(btrim(client->>'phone'), ''))
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, 'confirmed', NULLIF(btrim(notes), ''),
    public._hash_manage_token(v_manage_token), v_ends_at + interval '1 hour', 'client-self-service'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'confirmed', 'manage_token', v_manage_token, 'source', 'client-self-service');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  client_id text DEFAULT NULL,
  walk_in_name text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_manual_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF create_admin_manual_booking.branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_manual_booking.branch_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_manual_booking.branch_id
        AND br.business_id = create_admin_manual_booking.business_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
    END IF;
  END IF;

  BEGIN
    v_service_id := create_admin_manual_booking.service_id::uuid;
    v_customer_id := nullif(btrim(create_admin_manual_booking.client_id), '')::uuid;
    v_starts_at := create_admin_manual_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF create_admin_manual_booking.duration_minutes IS NULL OR create_admin_manual_booking.duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = v_service_id
      AND s.business_id = create_admin_manual_booking.business_id
      AND COALESCE(s.is_active, true) = true
  ) THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer_id
      AND c.business_id = create_admin_manual_booking.business_id
  ) THEN
    PERFORM public._raise_rpc('CUSTOMER_TENANT_MISMATCH');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => create_admin_manual_booking.duration_minutes);
  PERFORM public._assert_no_slot_conflict(
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_starts_at,
    v_ends_at
  );

  IF v_customer_id IS NULL AND nullif(btrim(create_admin_manual_booking.walk_in_name), '') IS NOT NULL THEN
    INSERT INTO public.customers (business_id, full_name)
    VALUES (create_admin_manual_booking.business_id, btrim(create_admin_manual_booking.walk_in_name))
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, professional_id, notes, source)
  VALUES (
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_customer_id,
    v_service_id,
    v_starts_at,
    v_ends_at,
    'confirmed',
    NULLIF(btrim(create_admin_manual_booking.professional_id), ''),
    NULLIF(btrim(create_admin_manual_booking.notes), ''),
    'admin-manual'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'type', 'manual-admin-appointment', 'status', 'confirmed', 'source', 'admin-manual');
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_reference_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_reference_catalog() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
