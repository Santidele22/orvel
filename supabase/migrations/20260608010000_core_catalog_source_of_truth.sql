-- Orvel core catalog source of truth for dashboard plans and business types.
-- Keeps plan entitlements and rubro catalogs in Supabase instead of client matrices.

BEGIN;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_locales integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_rubros integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_monthly_bookings integer,
  ADD COLUMN IF NOT EXISTS ai_credits_monthly integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.plan_aliases (
  alias text PRIMARY KEY,
  plan_code text NOT NULL REFERENCES public.plans(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias = upper(btrim(alias))),
  CHECK (plan_code = upper(btrim(plan_code)))
);

CREATE TABLE IF NOT EXISTS public.business_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  theme_key text NOT NULL DEFAULT 'default',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code = lower(btrim(code))),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS public.business_type_aliases (
  alias text PRIMARY KEY,
  business_type_code text NOT NULL REFERENCES public.business_types(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias = lower(btrim(alias)))
);

CREATE TABLE IF NOT EXISTS public.plan_business_types (
  plan_code text NOT NULL REFERENCES public.plans(code) ON DELETE CASCADE,
  business_type_code text NOT NULL REFERENCES public.business_types(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, business_type_code),
  CHECK (plan_code = upper(btrim(plan_code)))
);

COMMENT ON TABLE public.plan_business_types IS
  'Policy: all_plans_all_types. Every active core plan can choose from every active business type; max_rubros entitlements limit how many rubros a business may select.';

CREATE INDEX IF NOT EXISTS plan_aliases_plan_code_idx
  ON public.plan_aliases(plan_code);

CREATE INDEX IF NOT EXISTS business_type_aliases_business_type_code_idx
  ON public.business_type_aliases(business_type_code);

CREATE INDEX IF NOT EXISTS plan_business_types_business_type_code_idx
  ON public.plan_business_types(business_type_code);

UPDATE public.plans
SET
  max_locales = catalog.max_locales,
  max_rubros = catalog.max_rubros,
  max_monthly_bookings = catalog.max_monthly_bookings,
  ai_credits_monthly = catalog.ai_credits_monthly
FROM (VALUES
  ('FREE', 1, 1, 15, 0),
  ('STARTER', 1, 2, NULL::integer, 100),
  ('GROWTH', 3, 5, NULL::integer, 500),
  ('PRO', 10, 10, NULL::integer, 2000)
) AS catalog(code, max_locales, max_rubros, max_monthly_bookings, ai_credits_monthly)
WHERE public.plans.code = catalog.code;

INSERT INTO public.plans (
  code,
  name,
  description,
  price,
  price_quarterly,
  price_annual,
  currency,
  billing_frequency,
  billing_frequency_type,
  duration_days,
  is_active,
  is_featured,
  max_locales,
  max_rubros,
  max_monthly_bookings,
  ai_credits_monthly
)
VALUES
  ('FREE', 'Free', 'Ideal para empezar a ordenar tus turnos. 1 local, hasta 15 turnos/mes, reservas online, agenda automática.', 0, 0, 0, 'ARS', 1, 'months', 30, true, false, 1, 1, 15, 0),
  ('STARTER', 'Starter', 'Empezá a llenar tu agenda. Automatizá tus turnos y dejá de responder mensajes. 1 local, turnos ilimitados, link de reservas, sin branding.', 12000, 30000, 99000, 'ARS', 1, 'months', 30, true, true, 1, 2, NULL, 100),
  ('GROWTH', 'Growth', 'Reducí cancelaciones y ganá más. Menos ausencias, más ingresos reales. Hasta 3 locales, recordatorios automáticos, métricas, reportes semanales.', 22000, 55000, 179000, 'ARS', 1, 'months', 30, true, false, 3, 5, NULL, 500),
  ('PRO', 'Pro', 'Escalá tu negocio sin límites. Pensado para negocios que ya están creciendo. Hasta 10 locales, soporte prioritario, reportes avanzados, API (opcional).', 39000, 99000, 299000, 'ARS', 1, 'months', 30, true, false, 10, 10, NULL, 2000)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  price_quarterly = EXCLUDED.price_quarterly,
  price_annual = EXCLUDED.price_annual,
  currency = EXCLUDED.currency,
  billing_frequency = EXCLUDED.billing_frequency,
  billing_frequency_type = EXCLUDED.billing_frequency_type,
  duration_days = EXCLUDED.duration_days,
  is_active = EXCLUDED.is_active,
  is_featured = EXCLUDED.is_featured,
  max_locales = EXCLUDED.max_locales,
  max_rubros = EXCLUDED.max_rubros,
  max_monthly_bookings = EXCLUDED.max_monthly_bookings,
  ai_credits_monthly = EXCLUDED.ai_credits_monthly,
  updated_at = now();

INSERT INTO public.plan_aliases (alias, plan_code)
VALUES
  ('BASIC', 'STARTER'),
  ('MEDIUM', 'GROWTH'),
  ('STARTED', 'STARTER')
ON CONFLICT (alias) DO UPDATE SET plan_code = EXCLUDED.plan_code;

INSERT INTO public.business_types (code, label, theme_key, sort_order)
VALUES
  ('peluqueria', 'Peluquería', 'beauty', 10),
  ('unas', 'Uñas', 'beauty', 20),
  ('barberia', 'Barbería', 'beauty', 30),
  ('spa', 'Spa', 'wellness', 40),
  ('pestanas', 'Pestañas', 'beauty', 50),
  ('cejas', 'Cejas', 'beauty', 60),
  ('masajes', 'Masajes', 'wellness', 70),
  ('otro', 'Otro', 'default', 999)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  theme_key = EXCLUDED.theme_key,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.business_type_aliases (alias, business_type_code)
VALUES
  ('peluquería', 'peluqueria'),
  ('peluqueria', 'peluqueria'),
  ('salon', 'peluqueria'),
  ('salón', 'peluqueria'),
  ('uñas', 'unas'),
  ('unas', 'unas'),
  ('nails', 'unas'),
  ('barbería', 'barberia'),
  ('barberia', 'barberia'),
  ('barber shop', 'barberia'),
  ('spa', 'spa'),
  ('pestañas', 'pestanas'),
  ('pestanas', 'pestanas'),
  ('lashes', 'pestanas'),
  ('cejas', 'cejas'),
  ('brows', 'cejas'),
  ('masajes', 'masajes'),
  ('massage', 'masajes'),
  ('otro', 'otro'),
  ('other', 'otro')
ON CONFLICT (alias) DO UPDATE SET business_type_code = EXCLUDED.business_type_code;

INSERT INTO public.plan_business_types (plan_code, business_type_code)
-- Explicit all_plans_all_types seed policy: Santi has not defined per-plan
-- business-type restrictions; max_rubros limits selections, not catalog eligibility.
SELECT p.code, bt.code
FROM public.plans p
CROSS JOIN public.business_types bt
WHERE p.code IN ('FREE', 'STARTER', 'GROWTH', 'PRO')
ON CONFLICT (plan_code, business_type_code) DO NOTHING;

ALTER TABLE public.plan_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_type_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_business_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read plan aliases" ON public.plan_aliases;
DROP POLICY IF EXISTS "Public read business types" ON public.business_types;
DROP POLICY IF EXISTS "Public read business type aliases" ON public.business_type_aliases;
DROP POLICY IF EXISTS "Public read plan business types" ON public.plan_business_types;

CREATE POLICY "Public read plan aliases" ON public.plan_aliases FOR SELECT USING (true);
CREATE POLICY "Public read business types" ON public.business_types FOR SELECT USING (true);
CREATE POLICY "Public read business type aliases" ON public.business_type_aliases FOR SELECT USING (true);
CREATE POLICY "Public read plan business types" ON public.plan_business_types FOR SELECT USING (true);

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
        'max_locales', p.max_locales,
        'max_rubros', p.max_rubros,
        'max_monthly_bookings', p.max_monthly_bookings,
        'ai_credits_monthly', p.ai_credits_monthly
      ) ORDER BY p.price ASC, p.code ASC)
      FROM public.plans p
      WHERE p.code IN ('FREE', 'STARTER', 'GROWTH', 'PRO') AND p.is_active = true
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
RETURNS TABLE (business_id uuid, tenant_id uuid, subscription_status text, plan_code text, max_locales integer, max_rubros integer, max_monthly_bookings integer, ai_credits_monthly integer)
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

REVOKE ALL ON FUNCTION public.get_dashboard_reference_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_reference_catalog() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;

COMMIT;
