-- Forward-only admin booking cancel telemetry and mixed-version RPC compatibility.
-- Stores only sanitized, allowlisted failure metadata. No booking ids, raw errors,
-- provider messages, stack traces, customer data, or branch/business identifiers.

BEGIN;
CREATE TABLE IF NOT EXISTS public.admin_booking_cancel_failure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL DEFAULT 'admin-booking-cancel' CHECK (feature = 'admin-booking-cancel'),
  stage text NOT NULL CHECK (stage IN ('rpc', 'ui')),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_:-]{1,64}$'),
  status integer CHECK (status BETWEEN 100 AND 599),
  retryable boolean NOT NULL DEFAULT true
);
ALTER TABLE public.admin_booking_cancel_failure_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_booking_cancel_failure_events FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_booking_cancel_failure_events FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.record_admin_booking_cancel_failure(
  p_stage text,
  p_code text,
  p_status integer DEFAULT NULL,
  p_retryable boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage text;
  v_code text;
  v_status integer;
BEGIN
  v_stage := lower(nullif(btrim(p_stage), ''));
  IF v_stage NOT IN ('rpc', 'ui') THEN
    v_stage := 'rpc';
  END IF;

  v_code := left(regexp_replace(upper(coalesce(nullif(btrim(p_code), ''), 'UNKNOWN')), '[^A-Z0-9_:-]', '_', 'g'), 64);
  IF v_code = '' THEN
    v_code := 'UNKNOWN';
  END IF;

  IF p_status BETWEEN 100 AND 599 THEN
    v_status := p_status;
  ELSE
    v_status := NULL;
  END IF;

  INSERT INTO public.admin_booking_cancel_failure_events (stage, code, status, retryable)
  VALUES (v_stage, v_code, v_status, coalesce(p_retryable, true));
END;
$$;
REVOKE ALL ON FUNCTION public.record_admin_booking_cancel_failure(text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_admin_booking_cancel_failure(text, text, integer, boolean) TO authenticated, service_role;
-- Restore the old 4-arg signature for cached dashboard bundles without
-- reintroducing unscoped cross-branch cancellation. Old clients must upgrade to
-- the 5-arg branch-scoped RPC; the wrapper records a sanitized durable event
-- and returns an explicit sanitized error code through the existing RPC raiser.
CREATE OR REPLACE FUNCTION public.cancel_admin_booking(
  booking_id uuid,
  performed_by uuid,
  notes text,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.record_admin_booking_cancel_failure(
    'rpc',
    'CLIENT_UPGRADE_REQUIRED',
    409,
    false
  );

  PERFORM public._raise_rpc('CLIENT_UPGRADE_REQUIRED');

  RETURN jsonb_build_object(
    'booking_id', booking_id,
    'status', 'client_upgrade_required',
    'reason', reason,
    'performed_by', performed_by,
    'notes', notes
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) TO authenticated, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
