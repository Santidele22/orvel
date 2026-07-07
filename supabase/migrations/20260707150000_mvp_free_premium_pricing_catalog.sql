-- Orvel MVP pricing catalog: FREE + PREMIUM only.
-- Non-destructive rollout: legacy plan rows stay present for FK/history safety, but are deactivated.

BEGIN;

ALTER TABLE public.mp_plan_catalog
  DROP CONSTRAINT IF EXISTS mp_plan_catalog_tier_check;

UPDATE public.plans
SET
  is_active = false,
  active = false,
  is_featured = false,
  updated_at = now()
WHERE code NOT IN ('FREE', 'PREMIUM');

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
  active,
  is_featured,
  max_locales,
  max_rubros,
  max_monthly_bookings,
  ai_credits_monthly
)
VALUES
  ('FREE', 'Free', 'Agenda online para empezar con 1 local principal, hasta 30 turnos por mes y funciones core de reservas.', 0, 0, 0, 'ARS', 1, 'months', 30, true, true, false, 1, 1, 30, 0),
  ('PREMIUM', 'Premium', 'Turnos ilimitados para 1 local principal con las mismas funciones core de reservas del MVP.', 25000, 0, 0, 'ARS', 1, 'months', 30, true, true, true, 1, 1, NULL, 0)
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
  active = EXCLUDED.active,
  is_featured = EXCLUDED.is_featured,
  max_locales = EXCLUDED.max_locales,
  max_rubros = EXCLUDED.max_rubros,
  max_monthly_bookings = EXCLUDED.max_monthly_bookings,
  ai_credits_monthly = EXCLUDED.ai_credits_monthly,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL REFERENCES public.plans(code),
  currency text NOT NULL DEFAULT 'ARS',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  interval text NOT NULL DEFAULT 'month',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_code, currency, interval)
);

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY public_plan_prices_read ON public.plan_prices FOR SELECT USING (active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.plan_prices
SET active = false
WHERE plan_code NOT IN ('FREE', 'PREMIUM');

INSERT INTO public.plan_prices (plan_code, currency, amount_cents, interval, active)
VALUES
  ('FREE', 'ARS', 0, 'month', true),
  ('PREMIUM', 'ARS', 2500000, 'month', true)
ON CONFLICT (plan_code, currency, interval) DO UPDATE SET
  amount_cents = EXCLUDED.amount_cents,
  active = EXCLUDED.active;

INSERT INTO public.plan_entitlements (
  plan_code,
  max_locales,
  max_rubros,
  max_monthly_bookings,
  ai_credits_monthly,
  monthly_booking_limit,
  branch_base_limit,
  core_booking_features
)
VALUES
  ('FREE', 1, 1, 30, 0, 30, 1, true),
  ('PREMIUM', 1, 1, NULL, 0, NULL, 1, true)
ON CONFLICT (plan_code) DO UPDATE SET
  max_locales = EXCLUDED.max_locales,
  max_rubros = EXCLUDED.max_rubros,
  max_monthly_bookings = EXCLUDED.max_monthly_bookings,
  ai_credits_monthly = EXCLUDED.ai_credits_monthly,
  monthly_booking_limit = EXCLUDED.monthly_booking_limit,
  branch_base_limit = EXCLUDED.branch_base_limit,
  core_booking_features = EXCLUDED.core_booking_features;

DELETE FROM public.plan_business_types
WHERE plan_code NOT IN ('FREE', 'PREMIUM');

INSERT INTO public.plan_business_types (plan_code, business_type_code)
SELECT p.code, bt.code
FROM public.plans p
CROSS JOIN public.business_types bt
WHERE p.code IN ('FREE', 'PREMIUM')
  AND p.is_active = true
  AND bt.is_active = true
ON CONFLICT (plan_code, business_type_code) DO NOTHING;

DELETE FROM public.plan_aliases
WHERE alias IN ('BASIC', 'STARTED', 'STARTER', 'MEDIUM', 'GROWTH', 'PRO', 'SIMPLE', 'CRECE', 'ESCALA');

INSERT INTO public.plan_aliases (alias, plan_code)
VALUES
  ('BASIC', 'PREMIUM'),
  ('STARTED', 'PREMIUM'),
  ('STARTER', 'PREMIUM'),
  ('MEDIUM', 'PREMIUM'),
  ('GROWTH', 'PREMIUM'),
  ('PRO', 'PREMIUM'),
  ('SIMPLE', 'PREMIUM'),
  ('CRECE', 'PREMIUM'),
  ('ESCALA', 'PREMIUM')
ON CONFLICT (alias) DO UPDATE SET plan_code = EXCLUDED.plan_code;

UPDATE public.mp_plan_catalog
SET status = 'inactive', updated_at = now()
WHERE tier_code <> 'PREMIUM_MONTHLY';

ALTER TABLE public.mp_plan_catalog
  ADD CONSTRAINT mp_plan_catalog_tier_check CHECK (tier IN ('starter', 'growth', 'pro', 'premium'));

INSERT INTO public.mp_plan_catalog (
  tier,
  cadence,
  tier_code,
  currency,
  amount,
  frequency,
  frequency_type,
  preapproval_plan_id,
  status,
  metadata
)
VALUES (
  'premium',
  'monthly',
  'PREMIUM_MONTHLY',
  'ARS',
  25000,
  1,
  'months',
  '69fe95756d4d42748f573ef24846cb7b',
  'active',
  jsonb_build_object(
    'mp_reason', 'Orvel Premium Mensual',
    'manual_mp_followup_required', false
  )
)
ON CONFLICT (tier_code) DO UPDATE SET
  tier = EXCLUDED.tier,
  cadence = EXCLUDED.cadence,
  currency = EXCLUDED.currency,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency,
  frequency_type = EXCLUDED.frequency_type,
  preapproval_plan_id = EXCLUDED.preapproval_plan_id,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_active_plans()
RETURNS SETOF public.plans
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT *
  FROM public.plans
  WHERE is_active = true
    AND code IN ('FREE', 'PREMIUM')
  ORDER BY price ASC;
$$;

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
      WHERE p.code IN ('FREE', 'PREMIUM') AND p.is_active = true
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
      WHERE pbt.plan_code IN ('FREE', 'PREMIUM')
    ), '[]'::jsonb)
  );
$$;

COMMIT;
