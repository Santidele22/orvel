-- Premium monthly price change: ARS 25.000 -> ARS 9.000.
--
-- The price lives in three catalog surfaces and all three move together here:
--   public.plans.price              major units, read by get_active_plans() and
--                                   get_dashboard_reference_catalog()
--   public.plan_prices.amount_cents minor units, read by the billing surfaces
--   public.mp_plan_catalog.amount   legacy Mercado Pago catalog, read by
--                                   create-subscription to set expected_amount
--
-- NOT changed here: the Mercado Pago preapproval plan referenced by
-- mp_plan_catalog.preapproval_plan_id keeps its own price inside Mercado Pago.
-- If that legacy flow is ever reactivated, its price must be updated in the
-- Mercado Pago dashboard too, otherwise a 25.000 charge reconciles against the
-- 9.000 expected_amount written by this migration.

BEGIN;

UPDATE public.plans
SET
  price = 9000,
  updated_at = now()
WHERE code = 'PREMIUM';

UPDATE public.plan_prices
SET amount_cents = 900000
WHERE plan_code = 'PREMIUM'
  AND currency = 'ARS'
  AND interval = 'month';

UPDATE public.mp_plan_catalog
SET
  amount = 9000,
  updated_at = now()
WHERE tier_code = 'PREMIUM_MONTHLY';

COMMIT;
