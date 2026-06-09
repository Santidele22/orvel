BEGIN;

-- Canonical Mercado Pago subscription/preapproval validation RPC.
-- The underlying table remains billing_checkout_sessions for backward-compatible storage,
-- but new code must call this subscription/preapproval-named contract.
CREATE OR REPLACE FUNCTION public.validate_billing_subscription_session(
  p_external_reference text,
  p_business_id uuid,
  p_tenant_id uuid,
  p_plan_code text,
  p_amount numeric,
  p_currency text,
  p_provider_subscription_id text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  session_id uuid;
  normalized_reference text := trim(COALESCE(p_external_reference, ''));
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'validate_billing_subscription_session is service-role only' USING ERRCODE = '42501';
  END IF;

  IF normalized_reference = '' OR NOT (
    normalized_reference LIKE 'preapproval-session:%' OR
    normalized_reference LIKE 'subscription-session:%' OR
    normalized_reference LIKE 'checkout-session:%'
  ) THEN
    RAISE EXCEPTION 'invalid subscription/preapproval external_reference' USING ERRCODE = '22023';
  END IF;

  UPDATE public.billing_checkout_sessions bcs
  SET used_at = COALESCE(used_at, now()),
      provider_preference_id = COALESCE(provider_preference_id, p_provider_subscription_id),
      provider_resource_id = COALESCE(provider_resource_id, p_provider_subscription_id)
  WHERE bcs.external_reference = normalized_reference
    AND bcs.business_id = p_business_id
    AND bcs.tenant_id = p_tenant_id
    AND bcs.plan_code = p_plan_code
    AND bcs.expected_amount = p_amount
    AND bcs.expected_currency = p_currency
    AND bcs.expires_at > now()
    AND (bcs.used_at IS NULL OR (bcs.provider_resource_id = p_provider_subscription_id OR bcs.provider_preference_id = p_provider_subscription_id))
  RETURNING bcs.id INTO session_id;

  IF session_id IS NULL THEN
    RAISE EXCEPTION 'invalid subscription/preapproval external_reference' USING ERRCODE = '22023';
  END IF;

  RETURN session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_billing_subscription_session(text, uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_billing_subscription_session(text, uuid, uuid, text, numeric, text, text) TO service_role;

COMMENT ON FUNCTION public.validate_billing_subscription_session(text, uuid, uuid, text, numeric, text, text)
IS 'Validates Mercado Pago subscription/preapproval external_reference values. Accepts checkout-session only as legacy compatibility.';

COMMIT;
