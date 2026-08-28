-- Admin create was inserting bookings.created_by (column gone) and casting
-- service_id uuid to text. Drop the leftover no-branch overload too.

BEGIN;

DROP FUNCTION IF EXISTS public.create_admin_manual_booking(uuid, text, text, integer, uuid, uuid, uuid, text, text);

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

COMMIT;
NOTIFY pgrst, 'reload schema';
