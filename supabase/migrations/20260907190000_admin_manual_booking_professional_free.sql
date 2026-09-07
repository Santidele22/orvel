-- Admin walk-in and reschedule already lock and check roster capacity.
-- They must also refuse same-professional overlap (public create already does).
-- Roster capacity is unchanged: two different people may still share a wall-clock slot.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  client_id text DEFAULT NULL,
  walk_in_name text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service_id uuid;
  v_customer_id uuid;
  v_professional_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_manual_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  BEGIN
    v_service_id := create_admin_manual_booking.service_id::uuid;
    v_customer_id := nullif(btrim(create_admin_manual_booking.client_id), '')::uuid;
    v_professional_id := nullif(btrim(create_admin_manual_booking.professional_id), '')::uuid;
    v_starts_at := create_admin_manual_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF create_admin_manual_booking.duration_minutes IS NULL OR create_admin_manual_booking.duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF create_admin_manual_booking.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches br
    WHERE br.id = create_admin_manual_booking.branch_id
      AND br.business_id = create_admin_manual_booking.business_id
  ) THEN
    PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = v_service_id
      AND s.business_id = create_admin_manual_booking.business_id
      AND COALESCE(s.is_active, true) = true
  ) THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer_id
      AND c.business_id = create_admin_manual_booking.business_id
  ) THEN
    PERFORM public._raise_rpc('CUSTOMER_TENANT_MISMATCH');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => create_admin_manual_booking.duration_minutes);
  PERFORM public._lock_booking_conflict_window(
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_starts_at,
    v_ends_at
  );
  PERFORM public._assert_no_slot_conflict(
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_starts_at,
    v_ends_at
  );

  -- Same chair cannot overlap even when roster capacity still has an open seat.
  IF v_professional_id IS NOT NULL
     AND NOT public._professional_is_free(
       create_admin_manual_booking.business_id,
       v_professional_id,
       v_starts_at,
       v_ends_at
     ) THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

  IF v_customer_id IS NULL AND nullif(btrim(create_admin_manual_booking.walk_in_name), '') IS NOT NULL THEN
    INSERT INTO public.customers (business_id, full_name)
    VALUES (create_admin_manual_booking.business_id, btrim(create_admin_manual_booking.walk_in_name))
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.bookings (
    business_id,
    branch_id,
    customer_id,
    service_id,
    starts_at,
    ends_at,
    status,
    professional_id,
    notes,
    source
  )
  VALUES (
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_customer_id,
    v_service_id,
    v_starts_at,
    v_ends_at,
    'confirmed',
    v_professional_id::text,
    NULLIF(btrim(create_admin_manual_booking.notes), ''),
    'admin-manual'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'type', 'manual-admin-appointment',
    'status', 'confirmed',
    'source', 'admin-manual'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) TO authenticated, service_role;

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

  -- Moving a named professional onto an occupied chair is a slot conflict, not extra roster capacity.
  IF v_booking.professional_id IS NOT NULL
     AND NOT public._professional_is_free(
       v_booking.business_id,
       v_booking.professional_id::uuid,
       v_starts_at,
       v_ends_at,
       v_booking.id
     ) THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

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

REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
