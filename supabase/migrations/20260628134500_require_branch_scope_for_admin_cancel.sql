-- Forward-only fix for PostgREST overload resolution: keep the legacy 4-arg
-- wrapper optional, but make the branch-scoped 5-arg RPC require branch_id.

BEGIN;
DROP FUNCTION IF EXISTS public.cancel_admin_booking(uuid, uuid, uuid, text, text);
CREATE OR REPLACE FUNCTION public.cancel_admin_booking(
  booking_id uuid,
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
  v_updated_at timestamptz := now();
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = cancel_admin_booking.booking_id;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('INVALID_BOOKING');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF auth.role() <> 'service_role' AND cancel_admin_booking.branch_id IS NULL THEN
    PERFORM public._raise_rpc('ACTIVE_BRANCH_REQUIRED');
  END IF;

  IF cancel_admin_booking.branch_id IS NOT NULL AND v_booking.branch_id IS DISTINCT FROM cancel_admin_booking.branch_id THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF v_booking.status IN ('cancelled', 'canceled', 'completed', 'no_show') THEN
    PERFORM public._raise_rpc('TURNO_INVALID_STATUS_TRANSITION');
  END IF;

  UPDATE public.bookings bk
  SET status = 'cancelled',
      notes = COALESCE(NULLIF(btrim(cancel_admin_booking.notes), ''), bk.notes),
      updated_at = v_updated_at,
      manage_token_revoked_at = COALESCE(bk.manage_token_revoked_at, v_updated_at)
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'branch_id', v_booking.branch_id,
    'status', v_booking.status,
    'updated_at', v_booking.updated_at,
    'reason', reason,
    'performed_by', performed_by
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_admin_booking(uuid, uuid, uuid, text, text) TO authenticated, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
