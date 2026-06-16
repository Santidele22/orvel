-- Forward-only compatibility fix for protected pending signup PII.
-- Current writers store encrypted/HMAC fields only; legacy plaintext PII columns must remain nullable.
BEGIN;

ALTER TABLE public.pending_signup_intents
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN first_name DROP NOT NULL,
  ALTER COLUMN last_name DROP NOT NULL,
  ALTER COLUMN business_name DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL;

COMMIT;
