-- Forward-only admin reschedule hardening.
-- Authenticated browser callers must prove active branch scope at the RPC boundary;
-- old branchless overloads remain executable only for service_role compatibility.
-- Failure telemetry stores only sanitized operational metadata.

BEGIN;
CREATE TABLE IF NOT EXISTS public.admin_booking_reschedule_failure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL DEFAULT 'admin-booking-reschedule' CHECK (feature = 'admin-booking-reschedule'),
  stage text NOT NULL CHECK (stage IN ('rpc', 'ui')),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_:-]{1,64}$'),
  status integer CHECK (status BETWEEN 100 AND 599),
  retryable boolean NOT NULL DEFAULT true
);
ALTER TABLE public.admin_booking_reschedule_failure_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_booking_reschedule_failure_events FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_booking_reschedule_failure_events FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.record_admin_booking_reschedule_failure(
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

  INSERT INTO public.admin_booking_reschedule_failure_events (stage, code, status, retryable)
  VALUES (v_stage, v_code, v_status, coalesce(p_retryable, true));
END;
$$;
REVOKE ALL ON FUNCTION public.record_admin_booking_reschedule_failure(text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_admin_booking_reschedule_failure(text, text, integer, boolean) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(
  booking_id uuid,
  starts_at_iso text,
  branch_id uuid,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_timezone text;
  v_availability_date text;
  v_matching_slot_count integer;
  v_updated_at timestamptz := now();
BEGIN
  SELECT bk.*
  INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = reschedule_admin_booking.booking_id;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('INVALID_BOOKING');
  END IF;

  SELECT b.timezone
  INTO v_timezone
  FROM public.businesses b
  WHERE b.id = v_booking.business_id;

  IF auth.role() <> 'service_role' THEN
    IF reschedule_admin_booking.branch_id IS NULL THEN
      PERFORM public._raise_rpc('ACTIVE_BRANCH_REQUIRED');
    END IF;

    IF NOT public.can_manage_business(v_booking.business_id) THEN
      PERFORM public._raise_rpc('UNAUTHORIZED');
    END IF;
  END IF;

  IF reschedule_admin_booking.branch_id IS NOT NULL
     AND v_booking.branch_id IS DISTINCT FROM reschedule_admin_booking.branch_id THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF v_booking.status IN ('cancelled', 'canceled', 'completed', 'no_show') THEN
    PERFORM public._raise_rpc('TURNO_INVALID_STATUS_TRANSITION');
  END IF;

  BEGIN
    v_starts_at := reschedule_admin_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  v_duration_minutes := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer);
  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  v_availability_date := ((v_starts_at AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date)::text;

  SELECT count(*)
  INTO v_matching_slot_count
  FROM public._query_booking_slot_availability(
    v_booking.business_id,
    v_booking.service_id::uuid,
    v_availability_date,
    v_booking.branch_id,
    v_duration_minutes,
    v_booking.id,
    true
  ) AS availability
  WHERE availability.starts_at_iso::timestamptz = v_starts_at
    AND availability.ends_at_iso::timestamptz = v_ends_at
    AND availability.remaining_capacity > 0;

  IF v_matching_slot_count < 1 THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

  PERFORM public._lock_booking_conflict_window(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings bk
  SET starts_at = v_starts_at,
      ends_at = v_ends_at,
      notes = COALESCE(NULLIF(btrim(reschedule_admin_booking.notes), ''), bk.notes),
      updated_at = v_updated_at
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'starts_at_iso', v_booking.starts_at::text,
    'ends_at_iso', v_booking.ends_at::text,
    'updated_at', v_booking.updated_at::text,
    'reason', reason,
    'performed_by', performed_by
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(
  booking_id uuid,
  starts_at_iso text,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.record_admin_booking_reschedule_failure('rpc', 'ACTIVE_BRANCH_REQUIRED', 400, false);
    PERFORM public._raise_rpc('ACTIVE_BRANCH_REQUIRED');
  END IF;

  RETURN public.reschedule_admin_booking(booking_id, starts_at_iso, NULL::uuid, performed_by, notes, reason);
END;
$$;
CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(
  booking_id uuid,
  starts_at_iso text,
  performed_by text DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.record_admin_booking_reschedule_failure('rpc', 'ACTIVE_BRANCH_REQUIRED', 400, false);
    PERFORM public._raise_rpc('ACTIVE_BRANCH_REQUIRED');
  END IF;

  RETURN public.reschedule_admin_booking(booking_id, starts_at_iso, NULLIF(btrim(performed_by), '')::uuid, notes, reason);
END;
$$;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
