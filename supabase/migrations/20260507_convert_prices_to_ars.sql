-- Convert plan prices from USD to ARS (1 USD = 1400 ARS)
BEGIN;

UPDATE public.plans
SET
  price = price * 1400,
  price_quarterly = price_quarterly * 1400,
  price_annual = price_annual * 1400,
  currency = 'ARS',
  updated_at = now()
WHERE code IN ('STARTER', 'GROWTH', 'PRO');

COMMIT;
