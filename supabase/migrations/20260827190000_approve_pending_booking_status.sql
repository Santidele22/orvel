-- Allow operators to approve public pending bookings via update_booking_status.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_booking_status(booking_id uuid, status text, performed_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF update_booking_status.status NOT IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = update_booking_status.booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  IF update_booking_status.status = 'confirmed' THEN
    IF v_booking.status IS DISTINCT FROM 'pending' THEN
      PERFORM public._raise_rpc('BOOKING_STATUS_CONFIRM_REQUIRES_RESCHEDULE_OR_CREATE');
    END IF;
    PERFORM public._lock_booking_conflict_window(v_booking.business_id, v_booking.branch_id, v_booking.starts_at, v_booking.ends_at);
    PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_booking.starts_at, v_booking.ends_at, v_booking.id);
  END IF;

  UPDATE public.bookings
  SET status = update_booking_status.status, updated_at = now()
  WHERE id = update_booking_status.booking_id;

  RETURN jsonb_build_object('booking_id', booking_id, 'status', status, 'performed_by', performed_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_booking_status(uuid, text, uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
