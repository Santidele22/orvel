-- M7 minimal admin auth hardening: branch ownership validation for admin write RPCs.
-- Forward-only remediation. Do not allow a manageable business_id to write a
-- booking or blocked_time against another tenant's branch_id.

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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_manual_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF create_admin_manual_booking.branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_manual_booking.branch_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.branches br
      WHERE br.id = create_admin_manual_booking.branch_id
        AND br.business_id = create_admin_manual_booking.business_id
    ) THEN
      PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
    END IF;
  END IF;

  BEGIN
    v_service_id := create_admin_manual_booking.service_id::uuid;
    v_customer_id := nullif(btrim(create_admin_manual_booking.client_id), '')::uuid;
    v_starts_at := create_admin_manual_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF create_admin_manual_booking.duration_minutes IS NULL OR create_admin_manual_booking.duration_minutes <= 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => create_admin_manual_booking.duration_minutes);
  PERFORM public._assert_no_slot_conflict(
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_starts_at,
    v_ends_at
  );

  IF v_customer_id IS NULL AND nullif(btrim(create_admin_manual_booking.walk_in_name), '') IS NOT NULL THEN
    INSERT INTO public.customers (business_id, full_name)
    VALUES (create_admin_manual_booking.business_id, btrim(create_admin_manual_booking.walk_in_name))
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, professional_id, notes, source)
  VALUES (
    create_admin_manual_booking.business_id,
    create_admin_manual_booking.branch_id,
    v_customer_id,
    v_service_id,
    v_starts_at,
    v_ends_at,
    'confirmed',
    NULLIF(btrim(create_admin_manual_booking.professional_id), ''),
    NULLIF(btrim(create_admin_manual_booking.notes), ''),
    'admin-manual'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'type', 'manual-admin-appointment', 'status', 'confirmed', 'source', 'admin-manual');
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_block_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_blocked_time.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

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

  IF v_ends_at <= v_starts_at THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  PERFORM public._assert_no_slot_conflict(
    create_admin_blocked_time.business_id,
    create_admin_blocked_time.branch_id,
    v_starts_at,
    v_ends_at
  );

  INSERT INTO public.blocked_times (business_id, branch_id, starts_at, ends_at, reason)
  VALUES (
    create_admin_blocked_time.business_id,
    create_admin_blocked_time.branch_id,
    v_starts_at,
    v_ends_at,
    NULLIF(btrim(create_admin_blocked_time.reason), '')
  )
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object('blocked_time_id', v_block_id, 'block_id', v_block_id, 'type', 'blocked-time', 'performed_by', create_admin_blocked_time.performed_by);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_blocked_time(uuid, text, text, text, uuid, uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
