-- Core Slice 4 public manage-booking payload expansion.
-- Keeps the secure manage_token_hash lookup from Core Slice 3 and expands the
-- read-only manage view payload so the dashboard does not need raw bookings
-- table lookups by manage_token.
--
-- Product behavior preserved: a valid, unexpired token can still view booking
-- details after the cancellation/reschedule policy window closes, as long as
-- the booking has not started. In that state action flags are false. Once the
-- booking start time is reached, manage view keeps returning POLICY_WINDOW_CLOSED.

BEGIN;

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking public.bookings;
  v_row record;
  v_window integer;
  v_allow_cancel boolean;
  v_allow_reschedule boolean;
  v_policy_window_closes_at timestamptz;
  v_can_cancel boolean;
  v_can_reschedule boolean;
  v_duration_minutes integer;
  v_allowed_actions jsonb;
BEGIN
  BEGIN
    v_now := now_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  v_booking := public._load_manageable_booking(token, v_now);

  SELECT
    b.id AS business_id,
    b.slug AS business_slug,
    b.name AS business_name,
    b.timezone AS business_timezone,
    s.id AS service_id,
    s.name AS service_name,
    s.duration_minutes AS service_duration_minutes,
    s.price AS service_price,
    COALESCE(bs.cancellation_window_minutes, 60) AS cancellation_window_minutes,
    COALESCE(bs.allow_client_cancel, true) AS allow_client_cancel,
    COALESCE(bs.allow_client_reschedule, true) AS allow_client_reschedule
  INTO v_row
  FROM public.businesses b
  LEFT JOIN public.services s ON s.id = v_booking.service_id
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = v_booking.business_id
  LIMIT 1;

  IF v_row.business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  v_window := COALESCE(v_row.cancellation_window_minutes, 60);
  v_allow_cancel := COALESCE(v_row.allow_client_cancel, true);
  v_allow_reschedule := COALESCE(v_row.allow_client_reschedule, true);
  v_policy_window_closes_at := v_booking.starts_at - make_interval(mins => v_window);
  v_duration_minutes := GREATEST(0, ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer);

  IF v_booking.starts_at <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  v_can_cancel := v_allow_cancel IS TRUE AND v_policy_window_closes_at > v_now;
  v_can_reschedule := v_allow_reschedule IS TRUE AND v_policy_window_closes_at > v_now;

  SELECT COALESCE(jsonb_agg(action_name), '[]'::jsonb)
  INTO v_allowed_actions
  FROM (
    SELECT 'cancel' AS action_name WHERE v_can_cancel
    UNION ALL
    SELECT 'reschedule' AS action_name WHERE v_can_reschedule
  ) allowed;

  RETURN jsonb_build_object(
    -- Backward-compatible top-level fields currently consumed by the dashboard.
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'status', v_booking.status,
    'can_cancel_or_reschedule', (v_can_cancel OR v_can_reschedule),

    -- Expanded UI payload. Both camelCase and snake_case are intentionally
    -- present where the frontend contract may normalize either shape.
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'status', v_booking.status,
      'startsAtIso', v_booking.starts_at::text,
      'starts_at_iso', v_booking.starts_at::text,
      'endsAtIso', v_booking.ends_at::text,
      'ends_at_iso', v_booking.ends_at::text,
      'durationMinutes', v_duration_minutes,
      'duration_minutes', v_duration_minutes
    ),
    'business', jsonb_build_object(
      'id', v_row.business_id,
      'slug', v_row.business_slug,
      'name', v_row.business_name,
      'timezone', v_row.business_timezone
    ),
    'service', jsonb_build_object(
      'id', v_row.service_id,
      'name', v_row.service_name,
      'durationMinutes', COALESCE(v_row.service_duration_minutes, v_duration_minutes),
      'duration_minutes', COALESCE(v_row.service_duration_minutes, v_duration_minutes),
      'price', v_row.service_price
    ),
    'policy', jsonb_build_object(
      'cancellationWindowMinutes', v_window,
      'cancellation_window_minutes', v_window,
      'allowClientCancel', v_allow_cancel,
      'allow_client_cancel', v_allow_cancel,
      'allowClientReschedule', v_allow_reschedule,
      'allow_client_reschedule', v_allow_reschedule,
      'policyWindowClosesAtIso', v_policy_window_closes_at::text,
      'policy_window_closes_at_iso', v_policy_window_closes_at::text,
      'tokenExpiresAtIso', v_booking.manage_token_expires_at::text,
      'token_expires_at_iso', v_booking.manage_token_expires_at::text
    ),
    'actions', jsonb_build_object(
      'canCancel', v_can_cancel,
      'can_cancel', v_can_cancel,
      'canReschedule', v_can_reschedule,
      'can_reschedule', v_can_reschedule,
      'allowedActions', v_allowed_actions,
      'allowed_actions', v_allowed_actions
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
