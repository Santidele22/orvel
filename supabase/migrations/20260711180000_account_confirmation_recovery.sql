BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
ALTER TABLE public.signup_email_confirmations
  ADD COLUMN IF NOT EXISTS activation_binding_hash text,
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  ADD COLUMN IF NOT EXISTS resend_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_idempotency_key text,
  ADD COLUMN IF NOT EXISTS recovery_outbox_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS signup_email_confirmations_recovery_key_idx
  ON public.signup_email_confirmations(recovery_idempotency_key)
  WHERE recovery_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS signup_email_confirmations_binding_idx
  ON public.signup_email_confirmations(activation_binding_hash)
  WHERE activation_binding_hash IS NOT NULL;
ALTER TABLE public.notification_email_outbox
  ADD COLUMN IF NOT EXISTS confirmation_id uuid REFERENCES public.signup_email_confirmations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
WITH duplicate_active AS (
  SELECT id, row_number() OVER (
    PARTITION BY email_hmac, purpose ORDER BY (expires_at > now()) DESC, created_at DESC, id DESC
  ) AS position
  FROM public.signup_email_confirmations
  WHERE status = 'pending' AND consumed_at IS NULL
)
UPDATE public.signup_email_confirmations confirmation
SET status = 'expired', updated_at = now()
FROM duplicate_active duplicate
WHERE confirmation.id = duplicate.id AND duplicate.position > 1;
CREATE UNIQUE INDEX IF NOT EXISTS signup_email_confirmations_one_active_token_idx
  ON public.signup_email_confirmations(email_hmac, purpose)
  WHERE status = 'pending' AND consumed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_email_outbox_dedupe_key_idx
  ON public.notification_email_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notification_email_outbox_recovery_drain_idx
  ON public.notification_email_outbox(next_attempt_at, created_at)
  WHERE sent_at IS NULL AND confirmation_id IS NOT NULL;
COMMENT ON COLUMN public.notification_email_outbox.delivery_attempts IS
  'Operator-visible count for recovery delivery retries; increment only when scheduling a verified retry.';
COMMENT ON COLUMN public.notification_email_outbox.next_attempt_at IS
  'Earliest operator/worker retry time for an unsent recovery email; NULL means immediately drainable.';
CREATE TABLE IF NOT EXISTS public.signup_confirmation_lifecycle_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  confirmation_id uuid REFERENCES public.signup_email_confirmations(id) ON DELETE SET NULL,
  correlation_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('recovery_accepted', 'recovery_cooldown')),
  reason_code text NOT NULL CHECK (reason_code IN ('token_rotated', 'allowance_cooldown', 'temporary_cooldown')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (NOT payload ?| ARRAY['email', 'token', 'provider', 'provider_url', 'credentials']),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.signup_confirmation_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role reads signup confirmation lifecycle events"
  ON public.signup_confirmation_lifecycle_events FOR SELECT
  USING (auth.role() = 'service_role');
CREATE OR REPLACE FUNCTION public.recover_signup_email_confirmation(
  p_confirmation_id uuid, p_activation_binding_hash text, p_token_hash text,
  p_to_email text, p_outbox_payload jsonb, p_idempotency_key text,
  p_correlation_id text, p_abuse_bucket_hash text
)
RETURNS TABLE (accepted boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_confirmation public.signup_email_confirmations%ROWTYPE;
  v_now timestamptz;
  v_outbox_id uuid;
  v_retry integer;
  v_count integer;
  v_recipient text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'confirmation recovery is service-role only' USING ERRCODE = '42501';
  END IF;
  IF p_confirmation_id IS NULL OR NULLIF(btrim(p_activation_binding_hash), '') IS NULL
     OR NULLIF(btrim(p_token_hash), '') IS NULL OR NULLIF(btrim(p_to_email), '') IS NULL
     OR NULLIF(btrim(p_idempotency_key), '') IS NULL OR NULLIF(btrim(p_correlation_id), '') IS NULL
     OR NULLIF(btrim(p_abuse_bucket_hash), '') IS NULL THEN
    RAISE EXCEPTION 'invalid confirmation recovery request' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_confirmation FROM public.signup_email_confirmations
  WHERE id = p_confirmation_id AND consumed_at IS NULL AND status IN ('pending', 'expired')
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 60; RETURN; END IF;
  v_now := clock_timestamp();
  IF v_confirmation.activation_binding_hash IS NULL
     OR p_activation_binding_hash <> v_confirmation.activation_binding_hash THEN
    RAISE EXCEPTION 'activation binding mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_outbox_payload IS NULL
     OR p_outbox_payload->>'email_hmac' IS NULL
     OR p_outbox_payload->>'confirmation_id' IS NULL
     OR p_outbox_payload->>'email_hmac' <> v_confirmation.email_hmac
     OR p_outbox_payload->>'confirmation_id' <> p_confirmation_id::text THEN
    RAISE EXCEPTION 'outbox identity mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT to_email INTO v_recipient FROM public.notification_email_outbox
  WHERE confirmation_id = p_confirmation_id AND dedupe_key IS NULL ORDER BY created_at LIMIT 1;
  IF v_recipient IS NULL OR lower(btrim(p_to_email)) <> lower(btrim(v_recipient)) THEN
    RAISE EXCEPTION 'confirmation recipient mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_confirmation.recovery_idempotency_key = p_idempotency_key THEN
    IF v_confirmation.token_hash <> p_token_hash THEN
      RAISE EXCEPTION 'idempotency key conflicts with token' USING ERRCODE = '22023';
    END IF;
    v_retry := GREATEST(0, CEIL(EXTRACT(epoch FROM
      (COALESCE(v_confirmation.blocked_until, v_confirmation.resend_available_at, v_now) - v_now)))::integer);
    RETURN QUERY SELECT true, v_retry; RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('confirmation-recovery:' || p_abuse_bucket_hash, 0));
  IF public.guard_signup_request_rate_limit(
    'confirmation-recovery:' || p_abuse_bucket_hash,
    v_confirmation.email_hmac, 10, interval '15 minutes'
  ) THEN
    RETURN QUERY SELECT false, 900; RETURN;
  END IF;
  IF v_confirmation.blocked_until IS NOT NULL AND v_confirmation.blocked_until <= v_now THEN
    v_confirmation.resend_count := 0;
    v_confirmation.blocked_until := NULL;
  END IF;
  IF v_confirmation.blocked_until > v_now OR v_confirmation.resend_available_at > v_now THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(epoch FROM
      (GREATEST(v_confirmation.blocked_until, v_confirmation.resend_available_at) - v_now)))::integer);
    INSERT INTO public.signup_confirmation_lifecycle_events
      (confirmation_id, correlation_id, event_type, reason_code)
    VALUES (p_confirmation_id, p_correlation_id, 'recovery_cooldown',
      CASE WHEN v_confirmation.blocked_until > v_now THEN 'temporary_cooldown' ELSE 'allowance_cooldown' END);
    RETURN QUERY SELECT false, v_retry;
    RETURN;
  END IF;
  v_count := v_confirmation.resend_count + 1;
  INSERT INTO public.notification_email_outbox
    (to_email, template_key, payload, confirmation_id, dedupe_key)
  VALUES (btrim(p_to_email), 'signup_email_confirmation', p_outbox_payload, p_confirmation_id,
    'signup-confirmation:' || p_idempotency_key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key RETURNING id INTO v_outbox_id;
  UPDATE public.signup_email_confirmations
  SET status='pending', token_hash=p_token_hash, expires_at=v_now+interval '30 minutes',
      resend_count=v_count, resend_available_at=v_now+interval '60 seconds',
      blocked_until=CASE WHEN v_count >= 3 THEN v_now+interval '15 minutes' END,
      recovery_idempotency_key=p_idempotency_key, recovery_outbox_id=v_outbox_id,
      updated_at=v_now
  WHERE id=p_confirmation_id;
  INSERT INTO public.signup_confirmation_lifecycle_events
    (confirmation_id, correlation_id, event_type, reason_code, payload)
  VALUES (p_confirmation_id, p_correlation_id, 'recovery_accepted', 'token_rotated',
    jsonb_build_object('resend_count', v_count));
  RETURN QUERY SELECT true, 60;
END;
$$;
COMMENT ON FUNCTION public.recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text) IS
  'Service-role atomic recovery. Binding and payload identity must match persisted email_hmac; repeated identical idempotency keys converge, conflicting tokens fail.';
REVOKE ALL ON FUNCTION public.recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_signup_email_confirmation(uuid,text,text,text,jsonb,text,text,text)
  TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
