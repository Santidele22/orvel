-- Confirmation-first signup intents for FREE and PAID account creation.
-- After this RPC consumes a FREE token, application materialization enqueues business_welcome.
-- Raw tokens are delivered only through notification_email_outbox payloads; the DB stores token_hash only.
BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_email_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('free_signup', 'paid_signup')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'materializing', 'failed_materialization', 'materialized', 'expired', 'cancelled')),
  plan_code text NOT NULL,
  billing_period text NOT NULL DEFAULT 'monthly',
  email_hmac text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  protected_metadata jsonb NOT NULL,
  email_encrypted text,
  first_name_encrypted text,
  first_name_hmac text,
  last_name_encrypted text,
  last_name_hmac text,
  business_name_encrypted text,
  business_name_hmac text,
  phone_encrypted text,
  phone_hmac text,
  pii_crypto_version text,
  pending_signup_reference text,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_email_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages signup email confirmations" ON public.signup_email_confirmations;
CREATE POLICY "Service role manages signup email confirmations"
  ON public.signup_email_confirmations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS signup_email_confirmations_active_email_idx
  ON public.signup_email_confirmations(email_hmac, purpose, status, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.signup_request_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_hash text NOT NULL,
  email_hmac text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_request_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages signup request rate limits" ON public.signup_request_rate_limits;
CREATE POLICY "Service role manages signup request rate limits"
  ON public.signup_request_rate_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS signup_request_rate_limits_bucket_idx
  ON public.signup_request_rate_limits(bucket_hash, requested_at DESC);

CREATE OR REPLACE FUNCTION public.guard_signup_request_rate_limit(
  p_bucket_hash text,
  p_email_hmac text,
  p_max_requests integer DEFAULT 5,
  p_window interval DEFAULT interval '1 minute'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'guard_signup_request_rate_limit is service-role only' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.signup_request_rate_limits
  WHERE requested_at < now() - interval '1 day';

  SELECT count(*) INTO recent_count
  FROM public.signup_request_rate_limits
  WHERE bucket_hash = p_bucket_hash
    AND requested_at > now() - p_window;

  IF recent_count >= p_max_requests THEN
    RETURN true;
  END IF;

  INSERT INTO public.signup_request_rate_limits(bucket_hash, email_hmac)
  VALUES (p_bucket_hash, p_email_hmac);
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_signup_request_rate_limit(text, text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_signup_request_rate_limit(text, text, integer, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_signup_email_confirmation(
  p_email_hmac text,
  p_purpose text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'expire_signup_email_confirmation is service-role only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.signup_email_confirmations
  SET status = 'expired', updated_at = now()
  WHERE email_hmac = p_email_hmac
    AND purpose = p_purpose
    AND status = 'pending'
    AND consumed_at IS NULL
    AND expires_at <= now();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_signup_email_confirmation(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_signup_email_confirmation(text, text) TO service_role;

ALTER TABLE public.pending_signup_intents
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'pending'
    CHECK (confirmation_status IN ('pending', 'confirmed')),
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS pending_signup_intents_confirmation_idx
  ON public.pending_signup_intents(confirmation_status, email_confirmed_at, handoff_reference);

CREATE OR REPLACE FUNCTION public.consume_signup_email_confirmation(
  p_token_hash text
)
RETURNS TABLE (
  confirmation_id uuid,
  purpose text,
  plan_code text,
  billing_period text,
  email_hmac text,
  protected_metadata jsonb,
  email_encrypted text,
  first_name_encrypted text,
  first_name_hmac text,
  last_name_encrypted text,
  last_name_hmac text,
  business_name_encrypted text,
  business_name_hmac text,
  phone_encrypted text,
  phone_hmac text,
  pii_crypto_version text,
  pending_signup_reference text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'consume_signup_email_confirmation is service-role only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.signup_email_confirmations sec
    SET status = 'materializing',
        consumed_at = now(),
        updated_at = now()
    WHERE sec.token_hash = p_token_hash
      AND sec.status = 'pending'
      AND sec.consumed_at IS NULL
      AND sec.expires_at > now()
      AND (
        sec.purpose <> 'paid_signup'
        OR EXISTS (
          SELECT 1
          FROM public.pending_signup_intents psi
          WHERE psi.handoff_reference = sec.pending_signup_reference
            AND psi.email_hmac = sec.email_hmac
            AND psi.status IN ('created', 'provider_created')
            AND psi.expires_at > now()
        )
      )
    RETURNING sec.id, sec.purpose, sec.plan_code, sec.billing_period, sec.email_hmac, sec.protected_metadata,
      sec.email_encrypted, sec.first_name_encrypted, sec.first_name_hmac, sec.last_name_encrypted, sec.last_name_hmac,
      sec.business_name_encrypted, sec.business_name_hmac, sec.phone_encrypted, sec.phone_hmac, sec.pii_crypto_version,
      sec.pending_signup_reference
  ), paid_mark AS (
    UPDATE public.pending_signup_intents psi
    SET confirmation_status = 'confirmed',
        email_confirmed_at = now(),
        updated_at = now()
    FROM claimed c
    WHERE c.purpose = 'paid_signup'
      AND psi.handoff_reference = c.pending_signup_reference
      AND psi.email_hmac = c.email_hmac
      AND psi.status IN ('created', 'provider_created')
      AND psi.expires_at > now()
    RETURNING psi.id
  )
  SELECT c.id, c.purpose, c.plan_code, c.billing_period, c.email_hmac, c.protected_metadata,
    c.email_encrypted, c.first_name_encrypted, c.first_name_hmac, c.last_name_encrypted, c.last_name_hmac,
    c.business_name_encrypted, c.business_name_hmac, c.phone_encrypted, c.phone_hmac, c.pii_crypto_version,
    c.pending_signup_reference
  FROM claimed c
  LEFT JOIN paid_mark ON paid_mark.id IS NOT NULL
  WHERE c.purpose <> 'paid_signup' OR paid_mark.id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_signup_email_materialization(
  p_confirmation_id uuid,
  p_status text,
  p_business_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'complete_signup_email_materialization is service-role only' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('failed_materialization', 'materialized') THEN
    RAISE EXCEPTION 'invalid materialization status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.signup_email_confirmations
  SET status = p_status,
      protected_metadata = protected_metadata || jsonb_build_object('business_id', p_business_id),
      updated_at = now()
  WHERE id = p_confirmation_id
    AND status = 'materializing';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_email_materialization(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_email_materialization(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.consume_signup_email_confirmation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_signup_email_confirmation(text) TO service_role;

COMMIT;
