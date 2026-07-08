-- Final pre-MVP billing ledger pruning.
-- Canonical model:
-- - business_subscriptions: current subscription state
-- - payment_webhook_events: provider webhook inbox/idempotency
-- - subscription_payments: concrete provider payments
-- - subscription_events: business audit trail

BEGIN;

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_payment_id text NOT NULL,
  provider_subscription_id text,
  provider_event_id text,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'ARS',
  status text NOT NULL,
  status_detail text,
  paid_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now(),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_payment_id)
);

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mercado_pago',
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS status_detail text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.subscription_payments
  ALTER COLUMN business_id SET NOT NULL,
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN provider_payment_id SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN processed_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_provider_payment_uidx
  ON public.subscription_payments(provider, provider_payment_id);

CREATE INDEX IF NOT EXISTS subscription_payments_business_processed_idx
  ON public.subscription_payments(business_id, processed_at DESC);

CREATE INDEX IF NOT EXISTS subscription_payments_subscription_processed_idx
  ON public.subscription_payments(subscription_id, processed_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subscription_payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscription_payments TO service_role;

DO $$
DECLARE
  legacy_count bigint;
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.payments' INTO legacy_count;
    IF legacy_count = 0 THEN
      DROP TABLE public.payments;
    ELSE
      RAISE EXCEPTION 'Refusing to drop non-empty legacy table public.payments (% rows)', legacy_count;
    END IF;
  END IF;

  IF to_regclass('public.mp_webhook_events') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.mp_webhook_events' INTO legacy_count;
    IF legacy_count = 0 THEN
      DROP TABLE public.mp_webhook_events;
    ELSE
      RAISE EXCEPTION 'Refusing to drop non-empty legacy table public.mp_webhook_events (% rows)', legacy_count;
    END IF;
  END IF;
END $$;

COMMIT;
