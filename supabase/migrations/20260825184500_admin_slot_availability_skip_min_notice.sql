-- Admin create/reschedule/update must not apply the public min-notice window.
-- Operators can book remaining same-day slots after mid-afternoon.

BEGIN;

CREATE OR REPLACE FUNCTION public.query_admin_slot_availability(
  business_id uuid,
  service_id uuid,
  date_iso text,
  branch_id uuid DEFAULT NULL,
  context text DEFAULT 'admin-create',
  booking_id uuid DEFAULT NULL,
  duration_minutes integer DEFAULT NULL
)
RETURNS TABLE (starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context text := COALESCE(NULLIF(btrim(query_admin_slot_availability.context), ''), 'admin-create');
BEGIN
  IF query_admin_slot_availability.business_id IS NULL
     OR query_admin_slot_availability.service_id IS NULL
     OR nullif(btrim(query_admin_slot_availability.date_iso), '') IS NULL
     OR (query_admin_slot_availability.duration_minutes IS NOT NULL AND query_admin_slot_availability.duration_minutes <= 0) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF v_context NOT IN ('admin-create', 'admin-update', 'admin-reschedule') THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = query_admin_slot_availability.business_id) THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(query_admin_slot_availability.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF query_admin_slot_availability.booking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.id = query_admin_slot_availability.booking_id
      AND bk.business_id = query_admin_slot_availability.business_id
  ) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  RETURN QUERY
  SELECT helper.starts_at_iso, helper.ends_at_iso, helper.remaining_capacity
  FROM public._query_booking_slot_availability(
    query_admin_slot_availability.business_id,
    query_admin_slot_availability.service_id,
    query_admin_slot_availability.date_iso,
    query_admin_slot_availability.branch_id,
    query_admin_slot_availability.duration_minutes,
    query_admin_slot_availability.booking_id,
    false
  ) AS helper;
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_admin_slot_availability(uuid, uuid, text, uuid, text, uuid, integer) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
