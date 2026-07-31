-- Booking concurrency hardening for reschedule, blocked-time, and status flows.
-- Depends on public._lock_booking_conflict_window(...) from the booking lock helper slice.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_admin_booking(
  booking_id uuid,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL,
  client_id uuid DEFAULT NULL,
  service_id uuid DEFAULT NULL,
  duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_service_duration_minutes integer;
  v_current_duration_minutes integer;
  v_effective_duration_minutes integer;
  v_new_customer_id uuid;
  v_new_service_id uuid;
  v_new_ends_at timestamptz;
  v_should_recalculate_slot boolean;
  v_updated_at timestamptz := now();
BEGIN
  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = update_admin_booking.booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('BOOKING_NOT_FOUND'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  IF update_admin_booking.client_id IS NOT NULL THEN
    SELECT c.id INTO v_new_customer_id FROM public.customers c WHERE c.id = update_admin_booking.client_id AND c.business_id = v_booking.business_id;
    IF v_new_customer_id IS NULL THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  END IF;

  IF update_admin_booking.service_id IS NOT NULL THEN
    SELECT s.id, s.duration_minutes INTO v_new_service_id, v_service_duration_minutes
    FROM public.services s
    WHERE s.id = update_admin_booking.service_id AND s.business_id = v_booking.business_id AND COALESCE(s.is_active, true) = true;
    IF v_new_service_id IS NULL OR v_service_duration_minutes IS NULL OR v_service_duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  END IF;

  v_current_duration_minutes := ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer;
  IF v_current_duration_minutes IS NULL OR v_current_duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  IF update_admin_booking.duration_minutes IS NOT NULL AND update_admin_booking.duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  v_effective_duration_minutes := COALESCE(update_admin_booking.duration_minutes, v_service_duration_minutes, v_current_duration_minutes);
  v_should_recalculate_slot := update_admin_booking.service_id IS NOT NULL OR update_admin_booking.duration_minutes IS NOT NULL;

  IF v_should_recalculate_slot THEN
    v_new_ends_at := v_booking.starts_at + make_interval(mins => v_effective_duration_minutes);
    PERFORM public._lock_booking_conflict_window(v_booking.business_id, v_booking.branch_id, v_booking.starts_at, v_new_ends_at);
    PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_booking.starts_at, v_new_ends_at, v_booking.id);
  ELSE
    v_new_ends_at := v_booking.ends_at;
  END IF;

  UPDATE public.bookings bk
  SET notes = CASE WHEN update_admin_booking.notes IS NULL THEN bk.notes ELSE NULLIF(btrim(update_admin_booking.notes), '') END,
      customer_id = COALESCE(v_new_customer_id, bk.customer_id),
      service_id = COALESCE(v_new_service_id::text, bk.service_id),
      ends_at = CASE WHEN v_should_recalculate_slot THEN v_new_ends_at ELSE bk.ends_at END,
      updated_at = v_updated_at
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'updated_at', v_updated_at, 'customer_id', v_booking.customer_id, 'service_id', v_booking.service_id, 'duration_minutes', v_effective_duration_minutes, 'starts_at_iso', v_booking.starts_at::text, 'ends_at_iso', v_booking.ends_at::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
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
BEGIN
  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = reschedule_admin_booking.booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  BEGIN
    v_starts_at := reschedule_admin_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  v_duration_minutes := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer);
  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  PERFORM public._lock_booking_conflict_window(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings bk
  SET starts_at = v_starts_at,
      ends_at = v_ends_at,
      notes = COALESCE(NULLIF(btrim(reschedule_admin_booking.notes), ''), bk.notes),
      updated_at = now()
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'status', v_booking.status, 'starts_at_iso', v_booking.starts_at::text, 'ends_at_iso', v_booking.ends_at::text, 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by text DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.reschedule_admin_booking(booking_id, starts_at_iso, NULLIF(btrim(performed_by), '')::uuid, notes, reason);
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking_by_token(token text, now_iso text, starts_at_iso text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz;
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_window integer;
  v_allowed boolean;
BEGIN
  BEGIN
    v_now := now_iso::timestamptz;
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60), COALESCE(allow_client_reschedule, true)
  INTO v_window, v_allowed
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF COALESCE(v_allowed, true) IS NOT true OR v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  v_ends_at := v_starts_at + (v_booking.ends_at - v_booking.starts_at);
  PERFORM public._lock_booking_conflict_window(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings
  SET starts_at = v_starts_at, ends_at = v_ends_at, manage_token_expires_at = v_ends_at + interval '1 hour', updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_starts_at::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_blocked_time(
  business_id uuid,
  starts_at_iso text,
  ends_at_iso text,
  reason text DEFAULT NULL,
  performed_by uuid DEFAULT NULL,
  branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_block_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_blocked_time.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  IF create_admin_blocked_time.branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_blocked_time.branch_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_blocked_time.branch_id
        AND br.business_id = create_admin_blocked_time.business_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
    END IF;
  END IF;

  BEGIN
    v_starts_at := create_admin_blocked_time.starts_at_iso::timestamptz;
    v_ends_at := create_admin_blocked_time.ends_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;
  IF v_ends_at <= v_starts_at THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  PERFORM public._lock_booking_conflict_window(create_admin_blocked_time.business_id, create_admin_blocked_time.branch_id, v_starts_at, v_ends_at);

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.business_id = create_admin_blocked_time.business_id
      AND (create_admin_blocked_time.branch_id IS NULL OR b.branch_id = create_admin_blocked_time.branch_id)
      AND b.status = 'confirmed'
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) THEN
    PERFORM public._raise_rpc('BLOCKED_TIME_COLLISION');
  END IF;

  PERFORM public._assert_no_slot_conflict(create_admin_blocked_time.business_id, create_admin_blocked_time.branch_id, v_starts_at, v_ends_at);

  INSERT INTO public.blocked_times (business_id, branch_id, starts_at, ends_at, reason)
  VALUES (create_admin_blocked_time.business_id, create_admin_blocked_time.branch_id, v_starts_at, v_ends_at, NULLIF(btrim(create_admin_blocked_time.reason), ''))
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object('blocked_time_id', v_block_id, 'block_id', v_block_id, 'type', 'blocked-time', 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_booking_status(booking_id uuid, status text, performed_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF update_booking_status.status NOT IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  IF update_booking_status.status = 'confirmed' THEN PERFORM public._raise_rpc('BOOKING_STATUS_CONFIRM_REQUIRES_RESCHEDULE_OR_CREATE'); END IF;

  SELECT bk.business_id INTO v_business_id FROM public.bookings bk WHERE bk.id = update_booking_status.booking_id;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  UPDATE public.bookings
  SET status = update_booking_status.status, updated_at = now()
  WHERE id = update_booking_status.booking_id;

  RETURN jsonb_build_object('booking_id', booking_id, 'status', status, 'performed_by', performed_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_booking(uuid, uuid, text, text, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_blocked_time(uuid, text, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status(uuid, text, uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
