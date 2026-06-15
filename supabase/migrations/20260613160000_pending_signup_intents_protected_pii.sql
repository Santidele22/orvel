-- Forward-only additive PII protection fields for pending signup intents.
-- Keeps legacy plaintext columns for migration compatibility; current writers must use encrypted + HMAC fields.
BEGIN;

ALTER TABLE public.pending_signup_intents
  ADD COLUMN IF NOT EXISTS email_encrypted text,
  ADD COLUMN IF NOT EXISTS email_hmac text,
  ADD COLUMN IF NOT EXISTS first_name_encrypted text,
  ADD COLUMN IF NOT EXISTS first_name_hmac text,
  ADD COLUMN IF NOT EXISTS last_name_encrypted text,
  ADD COLUMN IF NOT EXISTS last_name_hmac text,
  ADD COLUMN IF NOT EXISTS business_name_encrypted text,
  ADD COLUMN IF NOT EXISTS business_name_hmac text,
  ADD COLUMN IF NOT EXISTS phone_encrypted text,
  ADD COLUMN IF NOT EXISTS phone_hmac text,
  ADD COLUMN IF NOT EXISTS pii_crypto_version text NOT NULL DEFAULT 'pending_signup_pii_v1';

CREATE UNIQUE INDEX IF NOT EXISTS pending_signup_intents_email_hmac_unique_idx
  ON public.pending_signup_intents(email_hmac)
  WHERE email_hmac IS NOT NULL;

CREATE INDEX IF NOT EXISTS pending_signup_intents_email_hmac_idx
  ON public.pending_signup_intents(email_hmac);

COMMIT;
