-- Harden default-service provisioning against caller-selected rubro escalation.
-- Adds stored selected-rubro state where the current schema can enforce it and
-- completes the DB catalog for all rubros accepted by signup product flows.
BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS selected_business_types text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.business_settings.selected_business_types IS
  'Server-side selected rubro allow-list used by default-service provisioning. Existing businesses without this value fall back to their primary business_type.';

INSERT INTO public.business_types (code, label, theme_key, sort_order)
VALUES
  ('estetica', 'Estética', 'beauty', 45),
  ('maquillaje', 'Maquillaje', 'beauty', 55)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  theme_key = EXCLUDED.theme_key,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.business_type_aliases (alias, business_type_code)
VALUES
  ('estética', 'estetica'),
  ('estetica', 'estetica'),
  ('makeup', 'maquillaje'),
  ('maquillaje', 'maquillaje')
ON CONFLICT (alias) DO UPDATE SET business_type_code = EXCLUDED.business_type_code;

INSERT INTO public.plan_business_types (plan_code, business_type_code)
SELECT p.code, bt.code
FROM public.plans p
JOIN public.business_types bt ON bt.code IN ('estetica', 'maquillaje')
WHERE p.code IN ('FREE', 'STARTER', 'GROWTH', 'PRO')
ON CONFLICT (plan_code, business_type_code) DO NOTHING;

WITH catalog(business_type_code, category, name, duration_minutes, sort_order) AS (
  VALUES
    ('estetica', 'Estética Facial', 'Limpieza facial', 45, 10),
    ('estetica', 'Estética Facial', 'Hidratación facial', 45, 20),
    ('estetica', 'Estética Facial', 'Peeling', 45, 30),
    ('estetica', 'Estética Facial', 'Dermaplaning', 45, 40),
    ('estetica', 'Estética Facial', 'Tratamientos antimanchas', 60, 50),
    ('estetica', 'Estética Corporal', 'Drenaje linfático', 60, 110),
    ('estetica', 'Estética Corporal', 'Radiofrecuencia', 45, 120),
    ('estetica', 'Estética Corporal', 'Presoterapia', 45, 130),
    ('estetica', 'Estética Corporal', 'Maderoterapia', 45, 140),
    ('maquillaje', 'Maquillaje', 'Maquillaje social', 60, 10),
    ('maquillaje', 'Maquillaje', 'Maquillaje de novia', 90, 20),
    ('maquillaje', 'Maquillaje', 'Maquillaje para evento', 60, 30),
    ('maquillaje', 'Maquillaje', 'Prueba de maquillaje', 60, 40),
    ('maquillaje', 'Maquillaje', 'Maquillaje express', 45, 50),
    ('maquillaje', 'Maquillaje', 'Perfilado y maquillaje de cejas', 45, 60)
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

CREATE OR REPLACE FUNCTION public.provision_default_services_for_business(
  p_business_id uuid,
  p_business_types text[]
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

  SELECT COALESCE((
    SELECT COALESCE(pa.plan_code, upper(btrim(bs.plan_code)))
    FROM public.business_subscriptions bs
    LEFT JOIN public.plan_aliases pa ON pa.alias = upper(btrim(bs.plan_code))
    WHERE bs.business_id = p_business_id
      AND COALESCE(bs.status, bs.subscription_status) IN ('active', 'trialing')
    ORDER BY bs.updated_at DESC NULLS LAST, bs.created_at DESC NULLS LAST
    LIMIT 1
  ), v_plan_code)
    INTO v_plan_code;

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
$$;

COMMENT ON FUNCTION public.provision_default_services_for_business(uuid, text[]) IS
  'Provision defaults only for active catalog rubros allowed by the business plan. Authenticated callers are additionally constrained to business_settings.selected_business_types (or primary business_type for legacy rows). service_role callers remain trusted for stored signup-intent selections.';

REVOKE ALL ON FUNCTION public.provision_default_services_for_business(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_default_services_for_business(uuid, text[]) TO authenticated, service_role;

COMMIT;
