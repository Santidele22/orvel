-- Canonicalize Mercado Pago preapproval plan catalog mapping.
-- BASIC/MEDIUM/STARTED remain input aliases only; stored plan catalog tiers use STARTER/GROWTH/PRO semantics.

BEGIN;

ALTER TABLE public.mp_plan_catalog
  DROP CONSTRAINT IF EXISTS mp_plan_catalog_tier_check;

UPDATE public.mp_plan_catalog
SET
  tier = CASE tier
    WHEN 'started' THEN 'starter'
    WHEN 'medium' THEN 'growth'
    ELSE tier
  END,
  tier_code = CASE
    WHEN upper(btrim(tier_code)) LIKE 'STARTED\_%' ESCAPE '\' THEN regexp_replace(upper(btrim(tier_code)), '^STARTED_', 'STARTER_')
    WHEN upper(btrim(tier_code)) LIKE 'MEDIUM\_%' ESCAPE '\' THEN regexp_replace(upper(btrim(tier_code)), '^MEDIUM_', 'GROWTH_')
    ELSE upper(btrim(tier_code))
  END,
  updated_at = now()
WHERE tier IN ('started', 'medium')
   OR upper(btrim(tier_code)) LIKE 'STARTED\_%' ESCAPE '\'
   OR upper(btrim(tier_code)) LIKE 'MEDIUM\_%' ESCAPE '\';

ALTER TABLE public.mp_plan_catalog
  ADD CONSTRAINT mp_plan_catalog_tier_check CHECK (tier IN ('starter', 'growth', 'pro'));

INSERT INTO public.mp_plan_catalog (tier, cadence, tier_code, currency, amount, frequency, frequency_type)
VALUES
  ('starter', 'monthly', 'STARTER_MONTHLY', 'ARS', 16800, 1, 'months'),
  ('starter', 'quarterly', 'STARTER_QUARTERLY', 'ARS', 42000, 3, 'months'),
  ('starter', 'annual', 'STARTER_ANNUAL', 'ARS', 138600, 12, 'months'),
  ('growth', 'monthly', 'GROWTH_MONTHLY', 'ARS', 30800, 1, 'months'),
  ('growth', 'quarterly', 'GROWTH_QUARTERLY', 'ARS', 77000, 3, 'months'),
  ('growth', 'annual', 'GROWTH_ANNUAL', 'ARS', 250600, 12, 'months'),
  ('pro', 'monthly', 'PRO_MONTHLY', 'ARS', 54600, 1, 'months'),
  ('pro', 'quarterly', 'PRO_QUARTERLY', 'ARS', 136500, 3, 'months'),
  ('pro', 'annual', 'PRO_ANNUAL', 'ARS', 458600, 12, 'months')
ON CONFLICT (tier, cadence)
DO UPDATE SET
  tier_code = EXCLUDED.tier_code,
  currency = EXCLUDED.currency,
  amount = EXCLUDED.amount,
  frequency = EXCLUDED.frequency,
  frequency_type = EXCLUDED.frequency_type,
  updated_at = now();

COMMIT;
