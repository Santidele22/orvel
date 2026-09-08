-- Additive: operator reject (no la veo) writes deposit_status='released'
-- (not abandoned/void) plus booking_deposit_evidence event_type='operator_reject'.
-- Lazy-release first like confirm. GRANT authenticated, service_role — not anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_booking_deposit_unseen(
  booking_id uuid,
  performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = reject_booking_deposit_unseen.booking_id;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_REJECT_REJECTED');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  PERFORM public.release_expired_booking_hold(v_booking.id, v_booking.business_id);

  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = v_booking.id;

  IF v_booking.deposit_status NOT IN ('pending', 'claim_pending') THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_REJECT_REJECTED');
  END IF;

  UPDATE public.bookings
  SET deposit_status = 'released',
      updated_at = now()
  WHERE id = v_booking.id
    AND deposit_status IN ('pending', 'claim_pending');

  IF NOT FOUND THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_REJECT_REJECTED');
  END IF;

  INSERT INTO public.booking_deposit_evidence (
    booking_id,
    business_id,
    event_type,
    note,
    performed_by
  ) VALUES (
    v_booking.id,
    v_booking.business_id,
    'operator_reject',
    NULL,
    reject_booking_deposit_unseen.performed_by
  );

  RETURN jsonb_build_object('booking_id', v_booking.id, 'deposit_status', 'released');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_booking_deposit_unseen(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_booking_deposit_unseen(uuid, uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
