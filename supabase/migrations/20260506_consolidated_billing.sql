-- Consolidated billing/onboarding migration (equivalent to legacy migrations #4 #5 #6)
BEGIN;

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  currency text DEFAULT 'USD',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS billing_frequency integer DEFAULT 1;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS billing_frequency_type text DEFAULT 'months';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 30;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_quarterly numeric;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS price_annual numeric;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS period_start timestamptz;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS period_end timestamptz;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_status text;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mercado_pago';
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_id text;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS provider_plan_id text;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamptz;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.business_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  status text NOT NULL,
  payment_type text,
  mp_payment_id text UNIQUE,
  mp_status_detail text,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload_hash text NOT NULL,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS provider_subscription_id text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS signature_ts bigint;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS signature_v1 text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS resource_id text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS signature_valid boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'reserved';
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.payment_webhook_events ADD COLUMN IF NOT EXISTS replay_window_seconds integer NOT NULL DEFAULT 300;

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_subscription_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload_hash text NOT NULL,
  transition_action text NOT NULL,
  previous_status text,
  next_status text,
  previous_version integer,
  next_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.plans(code),
  expected_amount numeric NOT NULL CHECK (expected_amount >= 0),
  expected_currency text NOT NULL DEFAULT 'ARS',
  provider text NOT NULL DEFAULT 'mercado_pago',
  provider_preference_id text,
  provider_plan_id text,
  provider_resource_id text,
  status text NOT NULL DEFAULT 'created',
  external_reference text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  started_by uuid DEFAULT auth.uid(),
  dry_run boolean NOT NULL DEFAULT true,
  scanned integer NOT NULL DEFAULT 0,
  drift_count integer NOT NULL DEFAULT 0,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Onboarding hooks/state-machine points (stable contract for app flow)
CREATE TABLE IF NOT EXISTS public.business_onboarding_state (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'plan_selected',
  selected_plan_code text,
  account_user_id uuid,
  business_type text,
  welcome_event_enqueued_at timestamptz,
  first_login_at timestamptz,
  dashboard_ready_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  step text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(business_id, step)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_subscriptions_provider_subscription_uidx
ON public.business_subscriptions(provider, provider_subscription_id)
WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_subscriptions_tenant_business_idx ON public.business_subscriptions(tenant_id, business_id);
CREATE INDEX IF NOT EXISTS business_subscriptions_status_period_idx ON public.business_subscriptions(status, current_period_end);
CREATE INDEX IF NOT EXISTS subscription_events_subscription_idx ON public.subscription_events(subscription_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS subscription_events_tenant_business_idx ON public.subscription_events(tenant_id, business_id);
CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_subscription_idx ON public.payment_webhook_events(provider, provider_subscription_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_request_uidx ON public.payment_webhook_events(provider, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_webhook_events_provider_resource_action_idx ON public.payment_webhook_events(provider, resource_id, action, received_at DESC);
CREATE INDEX IF NOT EXISTS billing_checkout_sessions_business_idx ON public.billing_checkout_sessions(tenant_id, business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_reconciliation_runs_tenant_idx ON public.billing_reconciliation_runs(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_active_plans() RETURNS SETOF public.plans LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT * FROM public.plans WHERE is_active = true ORDER BY price ASC; $$;
CREATE OR REPLACE FUNCTION public.get_plan_by_code(p_code text) RETURNS public.plans LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT * FROM public.plans WHERE code = p_code LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.record_onboarding_step(p_business_id uuid, p_step text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_current text;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner(p_business_id)) THEN
    RAISE EXCEPTION 'forbidden onboarding step write for business %', p_business_id USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.business_onboarding_state(business_id, current_step, updated_at)
  VALUES (p_business_id, p_step, now())
  ON CONFLICT (business_id) DO UPDATE SET current_step = EXCLUDED.current_step, updated_at = now();
  INSERT INTO public.onboarding_events(business_id, step, metadata) VALUES (p_business_id, p_step, COALESCE(p_metadata, '{}'::jsonb)) ON CONFLICT (business_id, step) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_business_welcome_email(p_business_id uuid, p_to_email text, p_owner_name text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_outbox_id uuid; v_business_name text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'enqueue_business_welcome_email is service-role only' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_business_name FROM public.businesses WHERE id = p_business_id;
  INSERT INTO public.notification_email_outbox(business_id, to_email, template_key, payload)
  VALUES (p_business_id, p_to_email, 'business_welcome', jsonb_build_object('business_name', COALESCE(v_business_name, 'Tu Negocio'), 'owner_name', COALESCE(p_owner_name, 'Propietario')))
  RETURNING id INTO v_outbox_id;
  UPDATE public.business_onboarding_state SET welcome_event_enqueued_at = now(), updated_at = now() WHERE business_id = p_business_id;
  PERFORM public.record_onboarding_step(p_business_id, 'welcome_event_enqueued', jsonb_build_object('outbox_id', v_outbox_id));
  RETURN v_outbox_id;
END;
$$;

-- keep legacy + remediation RPC contracts
CREATE OR REPLACE FUNCTION public.get_business_entitlements_snapshot(p_business_id uuid, p_tenant_id uuid)
RETURNS TABLE (business_id uuid, tenant_id uuid, subscription_status text, plan_code text, max_locales integer, max_rubros integer, ai_credits_monthly integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner(p_business_id)) THEN RAISE EXCEPTION 'forbidden entitlement snapshot for business %', p_business_id USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT bs.business_id, bs.tenant_id, bs.status, bs.plan_code,
    CASE bs.plan_code WHEN 'PRO' THEN 10 WHEN 'MEDIUM' THEN 3 WHEN 'GROWTH' THEN 3 ELSE 1 END,
    CASE bs.plan_code WHEN 'PRO' THEN 10 WHEN 'MEDIUM' THEN 3 WHEN 'GROWTH' THEN 5 WHEN 'BASIC' THEN 2 ELSE 1 END,
    CASE bs.plan_code WHEN 'PRO' THEN 2000 WHEN 'MEDIUM' THEN 500 WHEN 'GROWTH' THEN 500 WHEN 'BASIC' THEN 100 ELSE 0 END
  FROM public.business_subscriptions bs WHERE bs.business_id = p_business_id AND bs.tenant_id = p_tenant_id AND bs.status IN ('active', 'trialing') ORDER BY bs.updated_at DESC LIMIT 1;
END; $$;

-- Core idempotency RPCs for Mercado Pago webhook integrity
CREATE OR REPLACE FUNCTION public.reserve_payment_webhook_event(p_provider text, p_provider_event_id text, p_request_id text, p_signature_ts bigint, p_signature_v1 text, p_resource_id text, p_action text, p_payload_hash text, p_replay_window_seconds integer DEFAULT 300)
RETURNS TABLE(event_id uuid, decision text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing public.payment_webhook_events%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'reserve_payment_webhook_event is service-role only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO existing FROM public.payment_webhook_events WHERE provider = p_provider AND provider_event_id = p_provider_event_id FOR UPDATE;
  IF FOUND THEN
    event_id := existing.id;
    IF existing.payload_hash <> p_payload_hash THEN decision := 'payload_conflict';
    ELSIF existing.processing_state = 'processed' OR existing.processed_at IS NOT NULL THEN decision := 'duplicate_processed';
    ELSE UPDATE public.payment_webhook_events SET processing_state = 'reserved', failed_at = NULL, failure_reason = NULL, received_at = now(), request_id = p_request_id, signature_ts = p_signature_ts, signature_v1 = p_signature_v1, resource_id = p_resource_id, action = p_action, event_type = p_action WHERE id = existing.id; decision := 'retry'; END IF;
    RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.payment_webhook_events(provider, provider_event_id, request_id, signature_ts, signature_v1, resource_id, action, event_type, payload_hash, replay_window_seconds, signature_valid, processing_state, received_at)
  VALUES (p_provider, p_provider_event_id, p_request_id, p_signature_ts, p_signature_v1, p_resource_id, p_action, p_action, p_payload_hash, p_replay_window_seconds, true, 'reserved', now()) RETURNING id INTO event_id;
  decision := 'reserved'; RETURN NEXT;
END; $$;

INSERT INTO public.plans (code, name, description, price, price_quarterly, price_annual, currency, billing_frequency, billing_frequency_type, duration_days, is_active, is_featured)
VALUES
('FREE', 'Free', 'Ideal para empezar a ordenar tus turnos. 1 local, hasta 15 turnos/mes, reservas online, agenda automática.', 0, 0, 0, 'USD', 1, 'months', 30, true, false),
('STARTER', 'Starter', 'Empezá a llenar tu agenda. Automatizá tus turnos y dejá de responder mensajes. 1 local, turnos ilimitados, link de reservas, sin branding.', 12, 30, 99, 'USD', 1, 'months', 30, true, true),
('GROWTH', 'Growth', 'Reducí cancelaciones y ganá más. Menos ausencias, más ingresos reales. Hasta 3 locales, recordatorios automáticos, métricas, reportes semanales.', 22, 55, 179, 'USD', 1, 'months', 30, true, false),
('PRO', 'Pro', 'Escalá tu negocio sin límites. Pensado para negocios que ya están creciendo. Hasta 10 locales, soporte prioritario, reportes avanzados, API (opcional).', 39, 99, 299, 'USD', 1, 'months', 30, true, false)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price, price_quarterly = EXCLUDED.price_quarterly, price_annual = EXCLUDED.price_annual, currency = EXCLUDED.currency, is_active = EXCLUDED.is_active, is_featured = EXCLUDED.is_featured, updated_at = now();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_webhook_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payment_webhook_events TO service_role;

CREATE OR REPLACE FUNCTION public.mark_payment_webhook_event_state(p_provider text, p_provider_event_id text, p_state text, p_failure_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'mark_payment_webhook_event_state is service-role only' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('reserved', 'processing', 'processed', 'failed') THEN RAISE EXCEPTION 'invalid webhook processing state %', p_state USING ERRCODE = '22023'; END IF;
  UPDATE public.payment_webhook_events
  SET processing_state = p_state,
      processing_started_at = CASE WHEN p_state = 'processing' THEN now() ELSE processing_started_at END,
      processed_at = CASE WHEN p_state = 'processed' THEN now() ELSE processed_at END,
      failed_at = CASE WHEN p_state = 'failed' THEN now() ELSE NULL END,
      failure_reason = CASE WHEN p_state = 'failed' THEN p_failure_reason ELSE NULL END
  WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_billing_checkout_session(p_external_reference text, p_business_id uuid, p_tenant_id uuid, p_plan_code text, p_amount numeric, p_currency text, p_provider_subscription_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE session_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'validate_billing_checkout_session is service-role only' USING ERRCODE = '42501'; END IF;
  UPDATE public.billing_checkout_sessions bcs
  SET used_at = COALESCE(used_at, now()), provider_preference_id = COALESCE(provider_preference_id, p_provider_subscription_id), provider_resource_id = COALESCE(provider_resource_id, p_provider_subscription_id)
  WHERE bcs.external_reference = p_external_reference AND bcs.business_id = p_business_id AND bcs.tenant_id = p_tenant_id AND bcs.plan_code = p_plan_code
    AND bcs.expected_amount = p_amount AND bcs.expected_currency = p_currency AND bcs.expires_at > now()
    AND (bcs.used_at IS NULL OR (bcs.provider_resource_id = p_provider_subscription_id OR bcs.provider_preference_id = p_provider_subscription_id))
  RETURNING bcs.id INTO session_id;
  IF session_id IS NULL THEN RAISE EXCEPTION 'invalid checkout external_reference' USING ERRCODE = '22023'; END IF;
  RETURN session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_subscription_event_transition(p_provider text, p_provider_event_id text, p_provider_subscription_id text, p_event_type text, p_payload_hash text, p_next_status text, p_plan_code text DEFAULT NULL, p_current_period_start timestamptz DEFAULT NULL, p_current_period_end timestamptz DEFAULT NULL, p_occurred_at timestamptz DEFAULT now())
RETURNS public.business_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_sub public.business_subscriptions%ROWTYPE; updated_sub public.business_subscriptions%ROWTYPE; canonical_next_status text; canonical_action text;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'apply_subscription_event_transition is service-role only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO current_sub FROM public.business_subscriptions WHERE provider = p_provider AND provider_subscription_id = p_provider_subscription_id ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found for provider event' USING ERRCODE = '22023'; END IF;
  canonical_next_status := lower(trim(COALESCE(p_next_status, '')));
  IF current_sub.status IN ('canceled', 'cancelled', 'expired') THEN RAISE EXCEPTION 'terminal subscription cannot transition from %', current_sub.status USING ERRCODE = '22023'; END IF;
  IF canonical_next_status = 'cancelled' THEN canonical_next_status := 'canceled'; END IF;
  IF canonical_next_status = '' THEN RAISE EXCEPTION 'next status required for subscription transition' USING ERRCODE = '22023'; END IF;
  IF canonical_next_status NOT IN ('pending', 'active', 'paused', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'unsupported subscription next status %', p_next_status USING ERRCODE = '22023';
  END IF;

  IF current_sub.status = 'pending' AND canonical_next_status NOT IN ('active', 'canceled') THEN
    RAISE EXCEPTION 'illegal transition from % to %', current_sub.status, canonical_next_status USING ERRCODE = '22023';
  ELSIF current_sub.status IN ('trialing', 'active') AND canonical_next_status NOT IN ('active', 'paused', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'illegal transition from % to %', current_sub.status, canonical_next_status USING ERRCODE = '22023';
  ELSIF current_sub.status = 'paused' AND canonical_next_status NOT IN ('active', 'canceled') THEN
    RAISE EXCEPTION 'illegal transition from % to %', current_sub.status, canonical_next_status USING ERRCODE = '22023';
  ELSIF current_sub.status = 'past_due' AND canonical_next_status NOT IN ('active', 'canceled') THEN
    RAISE EXCEPTION 'illegal transition from % to %', current_sub.status, canonical_next_status USING ERRCODE = '22023';
  END IF;
  -- p_event_type is audit metadata only; transition source-of-truth is p_next_status.
  canonical_action := CASE canonical_next_status
    WHEN 'active' THEN CASE WHEN p_plan_code IS DISTINCT FROM current_sub.plan_code THEN 'APPLY_PLAN_CHANGE' ELSE 'RENEW' END
    WHEN 'past_due' THEN 'MARK_PAST_DUE' WHEN 'canceled' THEN 'CANCEL_NOW' WHEN 'paused' THEN 'PAUSE' ELSE NULL END;
  UPDATE public.business_subscriptions
  SET status = canonical_next_status, plan_code = COALESCE(p_plan_code, plan_code), current_period_start = COALESCE(p_current_period_start, current_period_start), current_period_end = COALESCE(p_current_period_end, current_period_end),
      period_start = COALESCE(p_current_period_start, period_start), period_end = COALESCE(p_current_period_end, period_end), cancel_at_period_end = CASE WHEN canonical_next_status = 'canceled' THEN false ELSE cancel_at_period_end END,
      version = version + 1, updated_at = now()
  WHERE id = current_sub.id AND version = current_sub.version RETURNING * INTO updated_sub;
  INSERT INTO public.subscription_events(tenant_id, business_id, subscription_id, provider, provider_event_id, provider_subscription_id, event_type, occurred_at, payload_hash, transition_action, previous_status, next_status, previous_version, next_version)
  VALUES (current_sub.tenant_id, current_sub.business_id, current_sub.id, p_provider, p_provider_event_id, p_provider_subscription_id, p_event_type, COALESCE(p_occurred_at, now()), p_payload_hash, canonical_action, current_sub.status, updated_sub.status, current_sub.version, updated_sub.version)
  ON CONFLICT (provider, provider_event_id) DO NOTHING;
  RETURN updated_sub;
END; $$;

CREATE OR REPLACE FUNCTION public.reconcile_mercadopago_subscriptions_dry_run(p_tenant_id uuid, p_now timestamptz DEFAULT now())
RETURNS TABLE(scanned integer, drift_count integer, actions jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE action_rows jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'reconcile_mercadopago_subscriptions_dry_run is service-role only' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('business_id', bs.business_id, 'provider_subscription_id', bs.provider_subscription_id, 'drift', 'PERIOD_MISMATCH', 'recommended_action', 'SYNC_PERIOD')), '[]'::jsonb)
  INTO action_rows FROM public.business_subscriptions bs
  WHERE bs.tenant_id = p_tenant_id AND bs.provider = 'mercado_pago' AND bs.status IN ('active', 'trialing') AND bs.current_period_end IS NOT NULL AND bs.current_period_end < p_now;
  scanned := (SELECT count(*)::integer FROM public.business_subscriptions WHERE tenant_id = p_tenant_id AND provider = 'mercado_pago');
  drift_count := jsonb_array_length(action_rows); actions := action_rows;
  INSERT INTO public.billing_reconciliation_runs(tenant_id, dry_run, scanned, drift_count, actions) VALUES (p_tenant_id, true, scanned, drift_count, actions);
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_payment_webhook_event(text, text, text, bigint, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_webhook_event(text, text, text, bigint, text, text, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.mark_payment_webhook_event_state(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payment_webhook_event_state(text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.validate_billing_checkout_session(text, uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_billing_checkout_session(text, uuid, uuid, text, numeric, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.apply_subscription_event_transition(text, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_event_transition(text, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_mercadopago_subscriptions_dry_run(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_mercadopago_subscriptions_dry_run(uuid, timestamptz) TO service_role;

COMMIT;
