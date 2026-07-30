-- Account-first paid signup intents and subscription-session validation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.account_first_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_encrypted text,
  email_hmac text,
  first_name_encrypted text,
  first_name_hmac text,
  last_name_encrypted text,
  last_name_hmac text,
  business_name_encrypted text,
  business_name_hmac text,
  phone_encrypted text,
  phone_hmac text,
  pii_crypto_version text NOT NULL DEFAULT 'account_first_pii_v1',
  business_type text,
  selected_business_types text[] NOT NULL DEFAULT '{}',
  plan_code text NOT NULL REFERENCES public.plans(code),
  billing_period text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'provider_created', 'approved', 'materializing', 'materialized', 'failed', 'expired')),
  provider text NOT NULL DEFAULT 'mercado_pago',
  external_reference text UNIQUE,
  provider_subscription_id text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  materialized_at timestamptz,
  idempotency_key_hash text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_first_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages account first intents" ON public.account_first_intents;
CREATE POLICY "Service role manages account first intents"
  ON public.account_first_intents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS account_first_intents_status_expires_idx
  ON public.account_first_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS account_first_intents_external_reference_idx
  ON public.account_first_intents(provider, external_reference);

ALTER TABLE public.billing_checkout_sessions
  ADD COLUMN IF NOT EXISTS account_first_intent_id uuid REFERENCES public.account_first_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_account_first_intent_idx
  ON public.billing_checkout_sessions(account_first_intent_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_account_first_subscription_session(
  p_external_reference text,
  p_amount numeric,
  p_currency text,
  p_provider_subscription_id text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  intent_id uuid;
  normalized_reference text := trim(COALESCE(p_external_reference, ''));
  normalized_provider_subscription_id text := trim(COALESCE(p_provider_subscription_id, ''));
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'validate_account_first_subscription_session is service-role only' USING ERRCODE = '42501';
  END IF;

  IF normalized_reference = '' OR normalized_provider_subscription_id = '' OR NOT (
    normalized_reference LIKE 'preapproval-session:%' OR
    normalized_reference LIKE 'subscription-session:%'
  ) THEN
    RAISE EXCEPTION 'invalid account-first subscription reference' USING ERRCODE = '22023';
  END IF;

  UPDATE public.account_first_intents afi
  SET status = 'materializing',
      updated_at = now()
  FROM public.billing_checkout_sessions bcs
  WHERE afi.id = bcs.account_first_intent_id
    AND afi.provider = 'mercado_pago'
    AND afi.external_reference = normalized_reference
    AND afi.provider_subscription_id = normalized_provider_subscription_id
    AND afi.status IN ('created', 'provider_created', 'approved')
    AND afi.expires_at > now()
    AND afi.materialized_at IS NULL
    AND afi.user_id IS NULL
    AND afi.business_id IS NULL
    AND bcs.external_reference = normalized_reference
    AND bcs.provider = 'mercado_pago'
    AND bcs.account_first_intent_id = afi.id
    AND bcs.expected_amount = p_amount
    AND bcs.expected_currency = p_currency
    AND bcs.expires_at > now()
    AND (bcs.used_at IS NULL OR bcs.provider_resource_id = normalized_provider_subscription_id OR bcs.provider_preference_id = normalized_provider_subscription_id)
  RETURNING afi.id INTO intent_id;

  IF intent_id IS NULL THEN
    RAISE EXCEPTION 'invalid account-first subscription session' USING ERRCODE = '22023';
  END IF;

  UPDATE public.billing_checkout_sessions bcs
  SET used_at = COALESCE(used_at, now()),
      provider_preference_id = COALESCE(provider_preference_id, normalized_provider_subscription_id),
      provider_resource_id = COALESCE(provider_resource_id, normalized_provider_subscription_id)
  WHERE bcs.account_first_intent_id = intent_id
    AND bcs.external_reference = normalized_reference;

  RETURN intent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_account_first_subscription_session(text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_account_first_subscription_session(text, numeric, text, text) TO service_role;

COMMIT;
