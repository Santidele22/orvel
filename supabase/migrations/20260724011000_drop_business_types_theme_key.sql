-- Orvel 1.0.2: Drop theme_key column from business_types
-- Removes per-rubro theming; Orvel now uses a single theme (zen) for all businesses.
-- Must redefine get_dashboard_reference_catalog() BEFORE dropping the column.

BEGIN;

-- Redefine get_dashboard_reference_catalog without theme_key in business_types
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

-- Drop theme_key now that no dependencies reference it
ALTER TABLE public.business_types DROP COLUMN IF EXISTS theme_key;

COMMIT;

NOTIFY pgrst, 'reload schema';
