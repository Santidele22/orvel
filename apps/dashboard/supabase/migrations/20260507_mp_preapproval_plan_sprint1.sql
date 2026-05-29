CREATE TABLE IF NOT EXISTS public.mp_plan_catalog (
  id uuid primary key default gen_random_uuid(),
  tier text not null,
  cadence text not null,
  tier_code text not null,
  preapproval_plan_id text not null,
  UNIQUE (tier, cadence),
  UNIQUE (tier_code),
  UNIQUE (preapproval_plan_id)
);

CREATE INDEX IF NOT EXISTS mp_plan_catalog_lookup_idx ON public.mp_plan_catalog (tier, cadence);

CREATE TABLE IF NOT EXISTS public.mp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  request_id text,
  resource_id text,
  payload_hash text not null,
  UNIQUE(provider, provider_event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mp_webhook_events_request_uidx ON public.mp_webhook_events (provider, request_id);
CREATE INDEX IF NOT EXISTS mp_webhook_events_resource_idx ON public.mp_webhook_events (provider, resource_id);

ALTER TABLE public.business_subscriptions
  ADD COLUMN IF NOT EXISTS mp_plan_catalog_id uuid,
  ADD COLUMN IF NOT EXISTS mp_external_reference text,
  ADD COLUMN IF NOT EXISTS mp_init_point text,
  ADD COLUMN IF NOT EXISTS mp_preapproval_plan_id text;

CREATE INDEX IF NOT EXISTS business_subscriptions_mp_reference_idx ON public.business_subscriptions (mp_external_reference);
CREATE INDEX IF NOT EXISTS business_subscriptions_mp_preapproval_idx ON public.business_subscriptions (mp_preapproval_id);
