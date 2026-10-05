-- Drop the 14-day automatic Premium trial.
--
-- The trial only existed to feed Mercado Pago: start_premium_trial() wrote a
-- PREMIUM/'trialing' row into business_subscriptions and the (already deleted)
-- subscription-expiry-check edge function was what eventually expired it.
-- Premium is now granted by hand - the customer transfers to the alias and the
-- owner activates the plan - and entitlements have read business_settings.plan
-- since 20260928210000. A 'trialing' subscription row therefore buys nothing,
-- and with no expiry job left it would never expire either.
--
-- This migration removes the RPC and the trial-only state it owned. The Mercado
-- Pago tables themselves (business_subscriptions and the other eight provider
-- tables) are dropped in a follow-up migration; only the trial column goes now.
--
-- Nothing else in the schema is trial-specific: 20260928210000 rewrote both
-- public.get_business_entitlements_snapshot() overloads without the lazy
-- trial-expiry branch, and no other object references premium_trial_used_at.

BEGIN;

-- Trial-only bookkeeping column. It lives on business_subscriptions, which is
-- dropped with the rest of the provider tables later; the column is guarded by
-- to_regclass so this migration still applies cleanly if that drop lands first.
DO $$
BEGIN
  IF to_regclass('public.business_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.business_subscriptions
      DROP COLUMN IF EXISTS premium_trial_used_at;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.start_premium_trial(uuid);

COMMIT;
NOTIFY pgrst, 'reload schema';
