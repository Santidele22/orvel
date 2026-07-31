-- Allow honest manual subscription audit events when no external provider id exists yet.
ALTER TABLE public.subscription_events
  ALTER COLUMN provider_subscription_id DROP NOT NULL;
