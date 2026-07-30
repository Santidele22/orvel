-- Orvel 1.0.2: Add is_promoted column to business_types
-- Marks 4 rubros as promoted (unas, masajes, barberia, peluqueria)
-- Updates get_dashboard_reference_catalog to include is_promoted

BEGIN;

ALTER TABLE public.business_types
  ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN NOT NULL DEFAULT false;

-- Reset all to false first, then promote the four selected rubros
UPDATE public.business_types SET is_promoted = false;
UPDATE public.business_types
  SET is_promoted = true
  WHERE code IN ('unas', 'masajes', 'barberia', 'peluqueria');

-- Redefine get_dashboard_reference_catalog to include is_promoted
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
        'sort_order', bt.sort_order,
        'is_promoted', bt.is_promoted
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

COMMIT;

NOTIFY pgrst, 'reload schema';
