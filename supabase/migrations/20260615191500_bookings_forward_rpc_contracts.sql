-- Forward RPC contracts for dashboard booking reads after direct table grants were revoked.
-- These SECURITY DEFINER functions preserve least-privilege access without
-- reopening public.bookings to anon/authenticated table SELECT privileges.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_admin_bookings(
  p_branch_id uuid,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  branch_id uuid,
  service_id uuid,
  customer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  notes text,
  source text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF p_branch_id IS NULL THEN
    PERFORM public._raise_rpc('BRANCH_REQUIRED');
  END IF;

  SELECT b.business_id
    INTO v_business_id
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.active IS TRUE
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_business(v_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN QUERY
  SELECT
    bk.id,
    bk.business_id,
    bk.branch_id,
    bk.service_id,
    bk.customer_id,
    bk.starts_at,
    bk.ends_at,
    bk.status,
    bk.notes,
    bk.source,
    bk.created_at,
    bk.updated_at
  FROM public.bookings bk
  WHERE bk.business_id = v_business_id
    AND bk.branch_id = p_branch_id
    AND (p_starts_at IS NULL OR bk.ends_at > p_starts_at)
    AND (p_ends_at IS NULL OR bk.starts_at < p_ends_at)
  ORDER BY bk.starts_at ASC, bk.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_admin_booking_in_branch(
  p_booking_id uuid,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking record;
BEGIN
  IF p_booking_id IS NULL OR p_branch_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT
    bk.id,
    bk.business_id,
    bk.branch_id,
    br.active AS branch_active
  INTO v_booking
  FROM public.bookings bk
  JOIN public.branches br ON br.id = bk.branch_id
  WHERE bk.id = p_booking_id
    AND bk.branch_id = p_branch_id
  LIMIT 1;

  IF v_booking.id IS NULL OR v_booking.branch_active IS NOT TRUE THEN
    PERFORM public._raise_rpc('TURNO_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_business(v_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'branch_id', v_booking.branch_id
  );
END;
$$;

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

COMMENT ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) IS '@orvel-contract admin_booking_list';
COMMENT ON FUNCTION public.assert_admin_booking_in_branch(uuid, uuid) IS '@orvel-contract active_branch_assertion';
COMMENT ON FUNCTION public.get_booking_notification_context(uuid, text) IS '@orvel-contract public_booking_context';

REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.assert_admin_booking_in_branch(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_admin_booking_in_branch(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_admin_booking_in_branch(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_admin_booking_in_branch(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_booking_notification_context(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_notification_context(uuid, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
