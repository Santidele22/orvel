-- Core Slice 4 admin booking update payload expansion.
-- Forward-only remediation: the admin lifecycle RPC owns customer, service,
-- duration, notes, authorization, and slot-conflict validation so the dashboard
-- does not update public.bookings directly.

BEGIN;

DROP FUNCTION IF EXISTS public.update_admin_booking(uuid, uuid, text, text);

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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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
  SELECT *
  INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = update_admin_booking.booking_id;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_NOT_FOUND');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF update_admin_booking.client_id IS NOT NULL THEN
    SELECT c.id
    INTO v_new_customer_id
    FROM public.customers c
    WHERE c.id = update_admin_booking.client_id
      AND c.business_id = v_booking.business_id;

    IF v_new_customer_id IS NULL THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;
  END IF;

  IF update_admin_booking.service_id IS NOT NULL THEN
    SELECT s.id, s.duration_minutes
    INTO v_new_service_id, v_service_duration_minutes
    FROM public.services s
    WHERE s.id = update_admin_booking.service_id
      AND s.business_id = v_booking.business_id
      AND COALESCE(s.is_active, true) = true;

    IF v_new_service_id IS NULL OR v_service_duration_minutes IS NULL OR v_service_duration_minutes <= 0 THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;
  END IF;

  v_current_duration_minutes := ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer;

  IF v_current_duration_minutes IS NULL OR v_current_duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF update_admin_booking.duration_minutes IS NOT NULL AND update_admin_booking.duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_effective_duration_minutes := COALESCE(
    update_admin_booking.duration_minutes,
    v_service_duration_minutes,
    v_current_duration_minutes
  );

  IF v_effective_duration_minutes IS NULL OR v_effective_duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_should_recalculate_slot := update_admin_booking.service_id IS NOT NULL
    OR update_admin_booking.duration_minutes IS NOT NULL;

  IF v_should_recalculate_slot THEN
    v_new_ends_at := v_booking.starts_at + make_interval(mins => v_effective_duration_minutes);
    PERFORM public._assert_no_slot_conflict(
      v_booking.business_id,
      v_booking.branch_id,
      v_booking.starts_at,
      v_new_ends_at,
      v_booking.id
    );
  ELSE
    v_new_ends_at := v_booking.ends_at;
  END IF;

  UPDATE public.bookings bk
  SET
    notes = CASE
      WHEN update_admin_booking.notes IS NULL THEN bk.notes
      ELSE NULLIF(btrim(update_admin_booking.notes), '')
    END,
    customer_id = COALESCE(v_new_customer_id, bk.customer_id),
    service_id = COALESCE(v_new_service_id, bk.service_id),
    ends_at = CASE WHEN v_should_recalculate_slot THEN v_new_ends_at ELSE bk.ends_at END,
    updated_at = v_updated_at
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'updated_at', v_updated_at,
    'customer_id', v_booking.customer_id,
    'service_id', v_booking.service_id,
    'duration_minutes', v_effective_duration_minutes,
    'starts_at_iso', v_booking.starts_at::text,
    'ends_at_iso', v_booking.ends_at::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_booking(uuid, uuid, text, text, uuid, uuid, integer) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
