-- Database-backed default service catalog per business type, with idempotent provisioning.
BEGIN;

CREATE TABLE IF NOT EXISTS public.business_type_default_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type_code text NOT NULL REFERENCES public.business_types(code) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 45 CHECK (duration_minutes > 0),
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_type_default_services IS
  'Default service templates provisioned for new businesses from their selected rubros/business types.';

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS default_service_id uuid REFERENCES public.business_type_default_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provisioned_from_business_type text REFERENCES public.business_types(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS business_type_default_services_catalog_key
  ON public.business_type_default_services (business_type_code, lower(btrim(name)), lower(btrim(category)));

CREATE INDEX IF NOT EXISTS business_type_default_services_type_sort_idx
  ON public.business_type_default_services (business_type_code, sort_order, name);

CREATE UNIQUE INDEX IF NOT EXISTS services_default_service_once_idx
  ON public.services (business_id, default_service_id)
  WHERE default_service_id IS NOT NULL;

WITH catalog(business_type_code, category, name, duration_minutes, sort_order) AS (
  VALUES
    ('barberia', 'Barbería', 'Corte de cabello', 45, 10),
    ('barberia', 'Barbería', 'Corte + barba', 45, 20),
    ('barberia', 'Barbería', 'Arreglo de barba', 45, 30),
    ('barberia', 'Barbería', 'Afeitado clásico', 45, 40),
    ('barberia', 'Barbería', 'Perfilado de cejas', 45, 50),
    ('barberia', 'Barbería', 'Coloración de cabello', 45, 60),
    ('barberia', 'Barbería', 'Coloración de barba', 45, 70),
    ('barberia', 'Barbería', 'Tratamiento capilar', 60, 80),
    ('barberia', 'Barbería', 'Lavado y peinado', 30, 90),
    ('peluqueria', 'Peluquería', 'Corte mujer', 45, 10),
    ('peluqueria', 'Peluquería', 'Corte hombre', 45, 20),
    ('peluqueria', 'Peluquería', 'Lavado', 30, 30),
    ('peluqueria', 'Peluquería', 'Peinado', 45, 40),
    ('peluqueria', 'Peluquería', 'Brushing', 45, 50),
    ('peluqueria', 'Peluquería', 'Coloración', 45, 60),
    ('peluqueria', 'Peluquería', 'Mechas/Balayage', 45, 70),
    ('peluqueria', 'Peluquería', 'Alisado', 45, 80),
    ('peluqueria', 'Peluquería', 'Keratina', 45, 90),
    ('peluqueria', 'Peluquería', 'Tratamientos capilares', 60, 100),
    ('unas', 'Uñas', 'Manicura', 45, 10),
    ('unas', 'Uñas', 'Pedicura', 45, 20),
    ('unas', 'Uñas', 'Esmaltado tradicional', 45, 30),
    ('unas', 'Uñas', 'Esmaltado semipermanente', 45, 40),
    ('unas', 'Uñas', 'Kapping', 45, 50),
    ('unas', 'Uñas', 'Uñas gel', 90, 60),
    ('unas', 'Uñas', 'Uñas acrílicas', 90, 70),
    ('unas', 'Uñas', 'Nail Art', 45, 80),
    ('unas', 'Uñas', 'Retiro de producto', 30, 90),
    ('unas', 'Uñas', 'Reparación de uñas', 45, 100),
    ('pestanas', 'Pestañas y Cejas', 'Extensiones de pestañas', 90, 10),
    ('pestanas', 'Pestañas y Cejas', 'Lifting de pestañas', 60, 20),
    ('pestanas', 'Pestañas y Cejas', 'Permanente de pestañas', 45, 30),
    ('pestanas', 'Pestañas y Cejas', 'Tinte de pestañas', 45, 40),
    ('pestanas', 'Pestañas y Cejas', 'Perfilado de cejas', 45, 50),
    ('pestanas', 'Pestañas y Cejas', 'Diseño de cejas', 45, 60),
    ('pestanas', 'Pestañas y Cejas', 'Laminado de cejas', 45, 70),
    ('cejas', 'Pestañas y Cejas', 'Extensiones de pestañas', 90, 10),
    ('cejas', 'Pestañas y Cejas', 'Lifting de pestañas', 60, 20),
    ('cejas', 'Pestañas y Cejas', 'Permanente de pestañas', 45, 30),
    ('cejas', 'Pestañas y Cejas', 'Tinte de pestañas', 45, 40),
    ('cejas', 'Pestañas y Cejas', 'Perfilado de cejas', 45, 50),
    ('cejas', 'Pestañas y Cejas', 'Diseño de cejas', 45, 60),
    ('cejas', 'Pestañas y Cejas', 'Laminado de cejas', 45, 70),
    ('masajes', 'Masajes', 'Relajante', 45, 10),
    ('masajes', 'Masajes', 'Descontracturante', 45, 20),
    ('masajes', 'Masajes', 'Deportivo', 45, 30),
    ('masajes', 'Masajes', 'Antiestrés', 45, 40),
    ('masajes', 'Masajes', 'Reflexología', 45, 50),
    ('masajes', 'Masajes', 'Drenaje linfático', 60, 60),
    ('spa', 'Spa / Bienestar', 'Circuito spa', 45, 10),
    ('spa', 'Spa / Bienestar', 'Masajes', 60, 20),
    ('spa', 'Spa / Bienestar', 'Tratamientos faciales', 60, 30),
    ('spa', 'Spa / Bienestar', 'Exfoliación corporal', 45, 40),
    ('spa', 'Spa / Bienestar', 'Hidroterapia', 45, 50),
    ('spa', 'Spa / Bienestar', 'Sauna', 45, 60),
    ('spa', 'Spa / Bienestar', 'Relax day', 45, 70),
    ('spa', 'Estética Facial', 'Limpieza facial', 45, 110),
    ('spa', 'Estética Facial', 'Hidratación facial', 45, 120),
    ('spa', 'Estética Facial', 'Antiacné', 45, 130),
    ('spa', 'Estética Facial', 'Dermaplaning', 45, 140),
    ('spa', 'Estética Facial', 'Peeling', 45, 150),
    ('spa', 'Estética Facial', 'Rejuvenecimiento facial', 45, 160),
    ('spa', 'Estética Facial', 'Tratamientos antimanchas', 60, 170),
    ('spa', 'Estética Corporal', 'Drenaje linfático', 60, 210),
    ('spa', 'Estética Corporal', 'Radiofrecuencia', 45, 220),
    ('spa', 'Estética Corporal', 'Presoterapia', 45, 230),
    ('spa', 'Estética Corporal', 'Cavitación', 45, 240),
    ('spa', 'Estética Corporal', 'Maderoterapia', 45, 250),
    ('spa', 'Estética Corporal', 'Exfoliación corporal', 45, 260),
    ('spa', 'Estética Corporal', 'Hidratación corporal', 45, 270),
    ('spa', 'Estética Corporal', 'Tonificación corporal', 45, 280),
    ('otro', 'Peluquería', 'Corte mujer', 45, 10),
    ('otro', 'Peluquería', 'Corte hombre', 45, 20),
    ('otro', 'Uñas', 'Manicura', 45, 110),
    ('otro', 'Uñas', 'Pedicura', 45, 120),
    ('otro', 'Barbería', 'Corte de cabello', 45, 210),
    ('otro', 'Barbería', 'Corte + barba', 45, 220)
)
INSERT INTO public.business_type_default_services (
  business_type_code,
  name,
  description,
  category,
  duration_minutes,
  price,
  is_active,
  sort_order
)
SELECT
  catalog.business_type_code,
  catalog.name,
  'Sugerencia para ' || catalog.category,
  catalog.category,
  catalog.duration_minutes,
  0,
  true,
  catalog.sort_order
FROM catalog
JOIN public.business_types bt ON bt.code = catalog.business_type_code
ON CONFLICT (business_type_code, (lower(btrim(name))), (lower(btrim(category)))) DO UPDATE SET
  description = EXCLUDED.description,
  duration_minutes = EXCLUDED.duration_minutes,
  price = EXCLUDED.price,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.business_type_default_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read business type default services" ON public.business_type_default_services;
CREATE POLICY "Public read business type default services"
  ON public.business_type_default_services FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.provision_default_services_for_business(
  p_business_id uuid,
  p_business_types text[]
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_inserted_count integer := 0;
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
$$;

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
  v_default_services_count integer := 0;
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
$$;

REVOKE ALL ON FUNCTION public.provision_default_services_for_business(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_default_services_for_business(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_onboarding(text, text, text, uuid) TO authenticated, service_role;

COMMIT;
