-- Deploy paid signup retry semantics for environments where the original
-- pending_signup_intents migration was already applied before PR #53.
BEGIN;

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
      provider_subscription_id = COALESCE(psi.provider_subscription_id, normalized_provider_subscription_id),
      external_reference = COALESCE(psi.external_reference, normalized_reference),
      updated_at = now()
  FROM public.billing_checkout_sessions bcs
  WHERE psi.id = bcs.pending_signup_intent_id
    AND psi.provider = 'mercado_pago'
    AND (psi.external_reference = normalized_reference OR psi.external_reference IS NULL)
    AND (psi.provider_subscription_id = normalized_provider_subscription_id OR psi.provider_subscription_id IS NULL)
    AND psi.status IN ('created', 'provider_created', 'approved', 'failed')
    AND psi.expires_at > now()
    AND psi.materialized_at IS NULL
    AND psi.business_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.business_subscriptions bs
      WHERE bs.provider = 'mercado_pago'
        AND bs.provider_subscription_id = normalized_provider_subscription_id
    )
    AND bcs.external_reference = normalized_reference
    AND bcs.provider = 'mercado_pago'
    AND bcs.pending_signup_intent_id = psi.id
    AND bcs.expected_amount = p_amount
    AND bcs.expected_currency = p_currency
    AND bcs.expires_at > now()
    AND (bcs.used_at IS NULL OR bcs.provider_resource_id = normalized_provider_subscription_id OR bcs.provider_preference_id = normalized_provider_subscription_id)
    AND (
      psi.status <> 'failed' OR
      (
        psi.user_id IS NOT NULL AND (
          psi.provider_subscription_id = normalized_provider_subscription_id OR
          bcs.provider_resource_id = normalized_provider_subscription_id OR
          bcs.provider_preference_id = normalized_provider_subscription_id
        )
      )
    )
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
