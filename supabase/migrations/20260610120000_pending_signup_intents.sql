-- Paid signup payment-before-account flow.
-- Stores minimal, non-sensitive signup intent data until MercadoPago approval.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_signup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  business_name text,
  phone text,
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

ALTER TABLE public.pending_signup_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages pending signup intents" ON public.pending_signup_intents;
CREATE POLICY "Service role manages pending signup intents"
  ON public.pending_signup_intents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS pending_signup_intents_status_expires_idx
  ON public.pending_signup_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS pending_signup_intents_external_reference_idx
  ON public.pending_signup_intents(provider, external_reference);

ALTER TABLE public.billing_checkout_sessions
  ALTER COLUMN tenant_id DROP NOT NULL,
  ALTER COLUMN business_id DROP NOT NULL,
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.billing_checkout_sessions
  ADD COLUMN IF NOT EXISTS pending_signup_intent_id uuid REFERENCES public.pending_signup_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_checkout_sessions_pending_signup_intent_idx
  ON public.billing_checkout_sessions(pending_signup_intent_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_pending_signup_subscription_session(
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
    RAISE EXCEPTION 'validate_pending_signup_subscription_session is service-role only' USING ERRCODE = '42501';
  END IF;

  IF normalized_reference = '' OR normalized_provider_subscription_id = '' OR NOT (
    normalized_reference LIKE 'preapproval-session:%' OR
    normalized_reference LIKE 'subscription-session:%'
  ) THEN
    RAISE EXCEPTION 'invalid pending signup subscription reference' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pending_signup_intents psi
  SET status = 'materializing',
      updated_at = now()
  FROM public.billing_checkout_sessions bcs
  WHERE psi.id = bcs.pending_signup_intent_id
    AND psi.provider = 'mercado_pago'
    AND psi.external_reference = normalized_reference
    AND psi.provider_subscription_id = normalized_provider_subscription_id
    AND psi.status IN ('created', 'provider_created', 'approved')
    AND psi.expires_at > now()
    AND psi.materialized_at IS NULL
    AND psi.user_id IS NULL
    AND psi.business_id IS NULL
    AND bcs.external_reference = normalized_reference
    AND bcs.provider = 'mercado_pago'
    AND bcs.pending_signup_intent_id = psi.id
    AND bcs.expected_amount = p_amount
    AND bcs.expected_currency = p_currency
    AND bcs.expires_at > now()
    AND (bcs.used_at IS NULL OR bcs.provider_resource_id = normalized_provider_subscription_id OR bcs.provider_preference_id = normalized_provider_subscription_id)
  RETURNING psi.id INTO intent_id;

  IF intent_id IS NULL THEN
    RAISE EXCEPTION 'invalid pending signup subscription session' USING ERRCODE = '22023';
  END IF;

  UPDATE public.billing_checkout_sessions bcs
  SET used_at = COALESCE(used_at, now()),
      provider_preference_id = COALESCE(provider_preference_id, normalized_provider_subscription_id),
      provider_resource_id = COALESCE(provider_resource_id, normalized_provider_subscription_id)
  WHERE bcs.pending_signup_intent_id = intent_id
    AND bcs.external_reference = normalized_reference;

  RETURN intent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pending_signup_subscription_session(text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_pending_signup_subscription_session(text, numeric, text, text) TO service_role;

COMMIT;
