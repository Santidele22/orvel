-- Store durable audit payloads needed for account-closure authorization evidence.
BEGIN;

ALTER TABLE public.subscription_events
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

COMMIT;
