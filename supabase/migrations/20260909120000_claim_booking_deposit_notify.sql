-- Additive: claim_booking_deposit inserts dashboard_notifications in the same
-- transaction as pending → claim_pending. Notify insert failure rolls the claim
-- back (no EXCEPTION WHEN OTHERS). Never paid. Not a business-email aviso.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_booking_deposit(
  manage_token text,
  note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF nullif(btrim(manage_token), '') IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.manage_token_hash = public._hash_manage_token(manage_token);

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  PERFORM public.release_expired_booking_hold(v_booking.id, v_booking.business_id);

  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = v_booking.id;

  IF v_booking.deposit_status IS DISTINCT FROM 'pending' THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  UPDATE public.bookings
  SET deposit_status = 'claim_pending',
      deposit_claimed_at = now(),
      updated_at = now()
  WHERE id = v_booking.id
    AND deposit_status = 'pending';

  IF NOT FOUND THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
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
    'claim',
    NULLIF(btrim(note), ''),
    NULL
  );

  INSERT INTO public.dashboard_notifications (
    business_id,
    appointment_id,
    event_type,
    title,
    body,
    metadata
  ) VALUES (
    v_booking.business_id,
    v_booking.id,
    'deposit.claimed',
    'Seña avisada',
    'El cliente avisó que transfirió la seña.',
    jsonb_build_object('booking_id', v_booking.id, 'deposit_code', v_booking.deposit_code)
  );

  RETURN jsonb_build_object('booking_id', v_booking.id, 'deposit_status', 'claim_pending');
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
