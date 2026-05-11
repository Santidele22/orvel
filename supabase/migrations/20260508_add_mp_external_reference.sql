BEGIN;

ALTER TABLE public.business_subscriptions
ADD COLUMN IF NOT EXISTS mp_external_reference text,
ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS business_subscriptions_mp_external_reference_uidx
ON public.business_subscriptions(mp_external_reference)
WHERE mp_external_reference IS NOT NULL;

COMMIT;