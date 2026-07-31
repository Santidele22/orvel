-- Fix public booking dashboard visibility, manage-link service labels, and lifecycle email payload fields.
-- This is forward-only: redefine the affected RPC helpers without mutating prior migrations.

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

  SELECT br.business_id
    INTO v_business_id
  FROM public.branches br
  WHERE br.id = p_branch_id
    AND COALESCE(br.is_active, true) IS TRUE
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

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_booking public.bookings;
  v_window integer;
  v_row record;
BEGIN
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60)
  INTO v_window
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF v_booking.starts_at <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  SELECT
    b.name AS business_name,
    b.slug AS business_slug,
    s.name AS service_name
  INTO v_row
  FROM public.businesses b
  LEFT JOIN public.services s ON s.id::text = v_booking.service_id::text
  WHERE b.id = v_booking.business_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'can_cancel_or_reschedule', v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) > v_now,
    'status', 'confirmed',
    'business', jsonb_build_object(
      'id', v_booking.business_id,
      'name', COALESCE(v_row.business_name, 'Orvel'),
      'slug', v_row.business_slug
    ),
    'service', jsonb_build_object(
      'id', v_booking.service_id,
      'name', COALESCE(v_row.service_name, 'Servicio')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._booking_lifecycle_email_payload(p_booking public.bookings)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'booking_id', p_booking.id,
    'customer_name', COALESCE(c.full_name, 'Cliente'),
    'service_name', COALESCE(s.name, 'Servicio'),
    'starts_at', p_booking.starts_at,
    'ends_at', p_booking.ends_at,
    'date', p_booking.starts_at,
    'time', to_char(p_booking.starts_at AT TIME ZONE COALESCE(br.timezone, b.timezone, 'America/Argentina/Buenos_Aires'), 'HH24:MI'),
    'duration', GREATEST(1, ROUND(EXTRACT(EPOCH FROM (p_booking.ends_at - p_booking.starts_at)) / 60.0)::integer),
    'duration_minutes', GREATEST(1, ROUND(EXTRACT(EPOCH FROM (p_booking.ends_at - p_booking.starts_at)) / 60.0)::integer),
    'price', COALESCE(s.price, 0),
    'business_name', COALESCE(b.name, 'Orvel'),
    'business_address', NULLIF(btrim(COALESCE(br.address, '')), ''),
    'branch_address', NULLIF(btrim(br.address), ''),
    'business_phone', bs.support_phone,
    'business_support_email', bs.support_email
  )
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  LEFT JOIN public.branches br ON br.id = p_booking.branch_id
  LEFT JOIN public.customers c ON c.id = p_booking.customer_id
  LEFT JOIN public.services s ON s.id::text = p_booking.service_id::text
  WHERE b.id = p_booking.business_id;
$$;

INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
SELECT
  bk.business_id,
  bk.id,
  'appointment.created',
  'Nuevo turno',
  'El cliente ' || COALESCE(c.full_name, 'Cliente') || ' reservó ' || COALESCE(s.name, 'Servicio') || '.',
  jsonb_build_object('customer_name', c.full_name, 'service_name', s.name, 'starts_at', bk.starts_at)
FROM public.bookings bk
LEFT JOIN public.customers c ON c.id = bk.customer_id
LEFT JOIN public.services s ON s.id::text = bk.service_id::text
WHERE bk.source = 'client-self-service'
  AND bk.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.dashboard_notifications dn WHERE dn.appointment_id = bk.id AND dn.event_type = 'appointment.created'
  );

COMMENT ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) IS '@orvel-contract admin_booking_list';
COMMENT ON FUNCTION public.manage_booking_by_token(text, text) IS '@orvel-contract public_manage_booking_context';

REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_booking_by_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public._booking_lifecycle_email_payload(public.bookings) FROM PUBLIC;

COMMIT;
NOTIFY pgrst, 'reload schema';
