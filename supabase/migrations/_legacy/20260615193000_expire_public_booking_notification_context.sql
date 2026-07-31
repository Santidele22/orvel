-- Tighten public booking notification context so leaked/old manage tokens cannot
-- read minimal notification data after the token management window expires.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_booking_notification_context(
  p_booking_id uuid,
  p_manage_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_token_hash text;
BEGIN
  IF p_booking_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF nullif(trim(coalesce(p_manage_token, '')), '') IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  v_token_hash := public._hash_manage_token(p_manage_token);

  SELECT
    bk.id,
    bk.business_id,
    bk.starts_at,
    bk.manage_token_hash,
    bk.manage_token_expires_at,
    c.full_name AS customer_name,
    c.email AS customer_email,
    s.name AS service_name,
    bs.support_email AS business_support_email
  INTO v_row
  FROM public.bookings bk
  LEFT JOIN public.customers c ON c.id = bk.customer_id
  LEFT JOIN public.services s ON s.id = bk.service_id
  LEFT JOIN public.business_settings bs ON bs.business_id = bk.business_id
  WHERE bk.id = p_booking_id
  LIMIT 1;

  IF v_row.id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF v_row.manage_token_hash IS NULL OR v_row.manage_token_hash <> v_token_hash THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  IF v_row.manage_token_expires_at IS NULL OR v_row.manage_token_expires_at < now() THEN
    PERFORM public._raise_rpc('TOKEN_EXPIRED');
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_row.id,
    'business_id', v_row.business_id,
    'starts_at', v_row.starts_at,
    'customer', jsonb_build_object(
      'full_name', v_row.customer_name,
      'email', v_row.customer_email
    ),
    'service', jsonb_build_object(
      'name', v_row.service_name
    ),
    'business', jsonb_build_object(
      'support_email', v_row.business_support_email
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_booking_notification_context(uuid, text) IS '@orvel-contract public_booking_context';

REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_notification_context(uuid, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
