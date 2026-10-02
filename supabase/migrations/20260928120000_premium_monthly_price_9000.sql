-- Premium monthly price change: ARS 25.000 -> ARS 9.000.
--
-- The price lives in two catalog surfaces and both move together here:
--   public.plans.price              major units, read by get_active_plans() and
--                                   get_dashboard_reference_catalog()
--   public.plan_prices.amount_cents minor units, read by the billing surfaces
--
-- Mercado Pago is deliberately out of scope: it is not integrated. The legacy
-- public.mp_plan_catalog row is left untouched by this migration.

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

COMMIT;
