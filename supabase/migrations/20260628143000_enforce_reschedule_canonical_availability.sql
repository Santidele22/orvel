-- Forward-only lifecycle fix: reschedule RPCs must use the same canonical
-- availability helper as public/admin slot lookup before mutating bookings.

BEGIN;

CREATE OR REPLACE FUNCTION public._load_manageable_booking(p_token text, p_now timestamptz)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_now timestamptz := now();
BEGIN
  IF nullif(btrim(p_token), '') IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings bk
  WHERE bk.manage_token_hash = public._hash_manage_token(p_token)
  LIMIT 1;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  IF v_booking.manage_token_revoked_at IS NOT NULL THEN
    IF v_booking.status IN ('cancelled', 'canceled') THEN
      PERFORM public._raise_rpc('BOOKING_ALREADY_CANCELLED');
    END IF;

    PERFORM public._raise_rpc('TOKEN_REVOKED');
  END IF;

  -- p_now is retained for RPC compatibility through existing callers, but token
  -- authorization must use transaction/server time and never caller input.
  IF v_booking.manage_token_expires_at IS NULL OR v_booking.manage_token_expires_at <= v_now THEN
    PERFORM public._raise_rpc('TOKEN_EXPIRED');
  END IF;

  IF v_booking.status IN ('cancelled', 'canceled') THEN
    PERFORM public._raise_rpc('BOOKING_ALREADY_CANCELLED');
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking_by_token(token text, now_iso text, starts_at_iso text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_window integer;
  v_allowed boolean;
  v_duration_minutes integer;
  v_timezone text;
  v_availability_date text;
  v_matching_slot_count integer;
  v_updated_at timestamptz := now();
BEGIN
  BEGIN
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(bs.cancellation_window_minutes, 60),
         COALESCE(bs.allow_client_reschedule, true),
         b.timezone
  INTO v_window, v_allowed, v_timezone
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = v_booking.business_id;

  IF COALESCE(v_allowed, true) IS NOT true OR v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

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
      manage_token_expires_at = v_ends_at + interval '1 hour',
      updated_at = v_updated_at
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'starts_at_iso', v_booking.starts_at::text,
    'ends_at_iso', v_booking.ends_at::text,
    'updated_at', v_booking.updated_at::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_booking public.bookings;
  v_window integer;
BEGIN
  -- now_iso remains in the signature for client compatibility only; closed-state
  -- and token checks use server transaction time through v_now/_load_manageable_booking.
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60)
  INTO v_window
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF v_booking.starts_at <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'can_cancel_or_reschedule', v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) > v_now,
    'status', 'confirmed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_booking public.bookings;
  v_window integer;
  v_allowed boolean;
BEGIN
  -- now_iso remains in the signature for client compatibility only; cancellation
  -- policy enforcement uses server transaction time.
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60), COALESCE(allow_client_cancel, true)
  INTO v_window, v_allowed
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF COALESCE(v_allowed, true) IS NOT true OR v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled',
      manage_token_revoked_at = COALESCE(manage_token_revoked_at, now()),
      updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'status', 'cancelled');
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

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN
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
  performed_by text DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.reschedule_admin_booking(booking_id, starts_at_iso, NULLIF(btrim(performed_by), '')::uuid, notes, reason);
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
