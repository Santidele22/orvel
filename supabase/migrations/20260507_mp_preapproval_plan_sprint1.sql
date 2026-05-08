BEGIN;

CREATE TABLE IF NOT EXISTS public.mp_plan_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL CHECK (tier IN ('started', 'medium', 'pro')),
  cadence text NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'annual')),
  tier_code text NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  frequency integer NOT NULL CHECK (frequency > 0),
  frequency_type text NOT NULL DEFAULT 'months',
  preapproval_plan_id text,
  status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, cadence),
  UNIQUE (tier_code),
  UNIQUE (preapproval_plan_id)
);

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS mp_plan_catalog_id uuid REFERENCES public.mp_plan_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mp_external_reference text,
  ADD COLUMN IF NOT EXISTS mp_init_point text,
  ADD COLUMN IF NOT EXISTS mp_preapproval_plan_id text,
  ADD COLUMN IF NOT EXISTS mp_last_webhook_at timestamptz;

CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_event_id text NOT NULL,
  event_type text,
  action text,
  resource_id text,
  request_id text,
  payload_hash text NOT NULL,
  payload jsonb,
  processed_at timestamptz,
  processing_state text NOT NULL DEFAULT 'reserved',
  failure_reason text,
  signature_valid boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS mp_plan_catalog_lookup_idx
  ON public.mp_plan_catalog (tier, cadence, currency);

CREATE INDEX IF NOT EXISTS mp_plan_catalog_sync_idx
  ON public.mp_plan_catalog (status, last_synced_at DESC);

CREATE INDEX IF NOT EXISTS business_subscriptions_mp_reference_idx
  ON public.business_subscriptions (mp_external_reference);

CREATE INDEX IF NOT EXISTS business_subscriptions_mp_preapproval_idx
  ON public.business_subscriptions (mp_preapproval_id, mp_preapproval_plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS mp_webhook_events_request_uidx
  ON public.mp_webhook_events(provider, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mp_webhook_events_resource_idx
  ON public.mp_webhook_events(provider, resource_id, action, received_at DESC);

INSERT INTO public.mp_plan_catalog (tier, cadence, tier_code, currency, amount, frequency, frequency_type)
VALUES
  ('started', 'monthly', 'STARTED_MONTHLY', 'ARS', 16800, 1, 'months'),
  ('started', 'quarterly', 'STARTED_QUARTERLY', 'ARS', 42000, 3, 'months'),
  ('started', 'annual', 'STARTED_ANNUAL', 'ARS', 138600, 12, 'months'),
  ('medium', 'monthly', 'MEDIUM_MONTHLY', 'ARS', 30800, 1, 'months'),
  ('medium', 'quarterly', 'MEDIUM_QUARTERLY', 'ARS', 77000, 3, 'months'),
  ('medium', 'annual', 'MEDIUM_ANNUAL', 'ARS', 250600, 12, 'months'),
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

ALTER TABLE public.mp_plan_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mp_plan_catalog FROM anon, authenticated;
REVOKE ALL ON TABLE public.mp_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mp_plan_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mp_webhook_events TO service_role;

COMMIT;
