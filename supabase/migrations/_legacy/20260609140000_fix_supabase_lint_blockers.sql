-- Fix Supabase DB lint blockers reported by plpgsql_check.
-- Forward-only and remote-compatible: current remote stores bookings.service_id
-- as text and pgcrypto routines live in the extensions schema.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE OR REPLACE FUNCTION public.check_table_exists(table_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = check_table_exists.table_name
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.query_public_slot_availability(
  business_slug text,
  service_id text,
  date_iso text
)
RETURNS TABLE(starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL
     OR nullif(btrim(service_id), '') IS NULL
     OR nullif(btrim(date_iso), '') IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  BEGIN
    v_service_id := service_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  SELECT b.id
  INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = query_public_slot_availability.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(query_public_slot_availability.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = v_service_id
      AND s.business_id = v_business_id
      AND COALESCE(s.is_active, true) = true
  ) THEN
    PERFORM public._raise_rpc('SERVICE_NOT_FOUND');
  END IF;

  RETURN QUERY
  SELECT helper.starts_at_iso, helper.ends_at_iso, helper.remaining_capacity
  FROM public._query_booking_slot_availability(
    v_business_id,
    v_service_id,
    query_public_slot_availability.date_iso,
    NULL,
    NULL,
    NULL,
    true
  ) AS helper;
END;
$$;

CREATE OR REPLACE FUNCTION public.query_public_availability_v2(
  slug text,
  service_id text,
  date_iso text
)
RETURNS TABLE(starts_at_iso text, ends_at_iso text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT q.starts_at_iso, q.ends_at_iso
  FROM public.query_public_slot_availability(
    query_public_availability_v2.slug,
    query_public_availability_v2.service_id,
    query_public_availability_v2.date_iso
  ) AS q;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  business_slug text,
  service_id text,
  starts_at_iso text,
  client jsonb,
  notes text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  branch_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_branch_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
  v_manage_token text := encode(extensions.gen_random_bytes(32), 'base64url');
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  END IF;

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = create_public_booking.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(create_public_booking.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  BEGIN
    v_service_id := create_public_booking.service_id::uuid;
    v_branch_id := nullif(btrim(create_public_booking.branch_id), '')::uuid;
    v_starts_at := create_public_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF v_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches br WHERE br.id = v_branch_id AND br.business_id = v_business_id
  ) THEN
    PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
  END IF;

  SELECT s.duration_minutes INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id
    AND s.business_id = v_business_id
    AND COALESCE(s.is_active, true) = true;

  IF v_duration_minutes IS NULL THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF nullif(btrim(client->>'fullName'), '') IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, btrim(client->>'fullName'), NULLIF(btrim(client->>'email'), ''), NULLIF(btrim(client->>'phone'), ''))
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token, manage_token_hash, manage_token_expires_at, source
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id::text, v_starts_at, v_ends_at, 'confirmed', NULLIF(btrim(notes), ''),
    v_manage_token, public._hash_manage_token(v_manage_token), v_ends_at + interval '1 hour', 'client-self-service'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'confirmed', 'manage_token', v_manage_token, 'source', 'client-self-service');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_public_booking(
  business_slug text,
  service_id text,
  starts_at_iso text,
  client jsonb,
  notes text DEFAULT NULL,
  professional_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.create_public_booking(business_slug, service_id, starts_at_iso, client, notes, professional_id, NULL::text);
$$;

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  LEFT JOIN public.services s ON s.id::text = v_booking.service_id
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
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'status', v_booking.status,
    'can_cancel_or_reschedule', (v_can_cancel OR v_can_reschedule),
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'status', v_booking.status,
      'startsAtIso', v_booking.starts_at::text,
      'starts_at_iso', v_booking.starts_at::text,
      'endsAtIso', v_booking.ends_at::text,
      'ends_at_iso', v_booking.ends_at::text,
      'durationMinutes', v_duration_minutes,
      'duration_minutes', v_duration_minutes,
      'notes', v_booking.notes
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
      'durationMinutes', v_row.service_duration_minutes,
      'duration_minutes', v_row.service_duration_minutes,
      'price', v_row.service_price
    ),
    'policy', jsonb_build_object(
      'cancellationWindowMinutes', v_window,
      'cancellation_window_minutes', v_window,
      'windowClosesAtIso', v_policy_window_closes_at::text,
      'window_closes_at_iso', v_policy_window_closes_at::text
    ),
    'allowedActions', v_allowed_actions,
    'allowed_actions', v_allowed_actions,
    'canCancel', v_can_cancel,
    'can_cancel', v_can_cancel,
    'canReschedule', v_can_reschedule,
    'can_reschedule', v_can_reschedule
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_booking(
  booking_id uuid,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL,
  client_id uuid DEFAULT NULL,
  service_id uuid DEFAULT NULL,
  duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_service_duration_minutes integer;
  v_current_duration_minutes integer;
  v_effective_duration_minutes integer;
  v_new_customer_id uuid;
  v_new_service_id uuid;
  v_new_ends_at timestamptz;
  v_should_recalculate_slot boolean;
  v_updated_at timestamptz := now();
BEGIN
  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = update_admin_booking.booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('BOOKING_NOT_FOUND'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  IF update_admin_booking.client_id IS NOT NULL THEN
    SELECT c.id INTO v_new_customer_id FROM public.customers c WHERE c.id = update_admin_booking.client_id AND c.business_id = v_booking.business_id;
    IF v_new_customer_id IS NULL THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  END IF;

  IF update_admin_booking.service_id IS NOT NULL THEN
    SELECT s.id, s.duration_minutes INTO v_new_service_id, v_service_duration_minutes
    FROM public.services s
    WHERE s.id = update_admin_booking.service_id AND s.business_id = v_booking.business_id AND COALESCE(s.is_active, true) = true;
    IF v_new_service_id IS NULL OR v_service_duration_minutes IS NULL OR v_service_duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  END IF;

  v_current_duration_minutes := ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer;
  IF v_current_duration_minutes IS NULL OR v_current_duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  IF update_admin_booking.duration_minutes IS NOT NULL AND update_admin_booking.duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  v_effective_duration_minutes := COALESCE(update_admin_booking.duration_minutes, v_service_duration_minutes, v_current_duration_minutes);
  v_should_recalculate_slot := update_admin_booking.service_id IS NOT NULL OR update_admin_booking.duration_minutes IS NOT NULL;

  IF v_should_recalculate_slot THEN
    v_new_ends_at := v_booking.starts_at + make_interval(mins => v_effective_duration_minutes);
    PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_booking.starts_at, v_new_ends_at, v_booking.id);
  ELSE
    v_new_ends_at := v_booking.ends_at;
  END IF;

  UPDATE public.bookings bk
  SET notes = CASE WHEN update_admin_booking.notes IS NULL THEN bk.notes ELSE NULLIF(btrim(update_admin_booking.notes), '') END,
      customer_id = COALESCE(v_new_customer_id, bk.customer_id),
      service_id = COALESCE(v_new_service_id::text, bk.service_id),
      ends_at = CASE WHEN v_should_recalculate_slot THEN v_new_ends_at ELSE bk.ends_at END,
      updated_at = v_updated_at
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'updated_at', v_updated_at, 'customer_id', v_booking.customer_id, 'service_id', v_booking.service_id, 'duration_minutes', v_effective_duration_minutes, 'starts_at_iso', v_booking.starts_at::text, 'ends_at_iso', v_booking.ends_at::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_admin_booking(booking_id uuid, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT bk.business_id INTO v_business_id FROM public.bookings bk WHERE bk.id = cancel_admin_booking.booking_id;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  UPDATE public.bookings bk
  SET status = 'cancelled',
      notes = COALESCE(NULLIF(btrim(cancel_admin_booking.notes), ''), bk.notes),
      updated_at = now(),
      manage_token_revoked_at = COALESCE(bk.manage_token_revoked_at, now())
  WHERE bk.id = cancel_admin_booking.booking_id AND bk.status = 'confirmed';

  RETURN jsonb_build_object('booking_id', booking_id, 'status', 'cancelled', 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
BEGIN
  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = reschedule_admin_booking.booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  BEGIN
    v_starts_at := reschedule_admin_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  v_duration_minutes := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (v_booking.ends_at - v_booking.starts_at)) / 60.0)::integer);
  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings bk
  SET starts_at = v_starts_at,
      ends_at = v_ends_at,
      notes = COALESCE(NULLIF(btrim(reschedule_admin_booking.notes), ''), bk.notes),
      updated_at = now()
  WHERE bk.id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'status', v_booking.status, 'starts_at_iso', v_booking.starts_at::text, 'ends_at_iso', v_booking.ends_at::text, 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by text DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.reschedule_admin_booking(booking_id, starts_at_iso, NULLIF(btrim(performed_by), '')::uuid, notes, reason);
$$;

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
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(create_admin_manual_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  BEGIN
    v_service_id := create_admin_manual_booking.service_id::uuid;
    v_customer_id := nullif(btrim(create_admin_manual_booking.client_id), '')::uuid;
    v_professional_id := nullif(btrim(create_admin_manual_booking.professional_id), '')::uuid;
    v_starts_at := create_admin_manual_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF create_admin_manual_booking.duration_minutes IS NULL OR create_admin_manual_booking.duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  IF create_admin_manual_booking.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches br WHERE br.id = create_admin_manual_booking.branch_id AND br.business_id = create_admin_manual_booking.business_id
  ) THEN
    PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = v_service_id AND s.business_id = create_admin_manual_booking.business_id AND COALESCE(s.is_active, true) = true) THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_customer_id AND c.business_id = create_admin_manual_booking.business_id) THEN
    PERFORM public._raise_rpc('CUSTOMER_TENANT_MISMATCH');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => create_admin_manual_booking.duration_minutes);
  PERFORM public._assert_no_slot_conflict(create_admin_manual_booking.business_id, create_admin_manual_booking.branch_id, v_starts_at, v_ends_at);

  IF v_customer_id IS NULL AND nullif(btrim(create_admin_manual_booking.walk_in_name), '') IS NOT NULL THEN
    INSERT INTO public.customers (business_id, full_name) VALUES (create_admin_manual_booking.business_id, btrim(create_admin_manual_booking.walk_in_name)) RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, professional_id, created_by, notes, source)
  VALUES (create_admin_manual_booking.business_id, create_admin_manual_booking.branch_id, v_customer_id, v_service_id::text, v_starts_at, v_ends_at, 'confirmed', v_professional_id, create_admin_manual_booking.performed_by, NULLIF(btrim(create_admin_manual_booking.notes), ''), 'admin-manual')
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'type', 'manual-admin-appointment', 'status', 'confirmed', 'source', 'admin-manual');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  professional_id uuid,
  performed_by uuid,
  client_id uuid DEFAULT NULL,
  walk_in_name text DEFAULT NULL,
  notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
  v_manage_token text;
BEGIN
  BEGIN
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR';
  END;

  v_ends_at := v_starts_at + make_interval(mins => greatest(duration_minutes, 1));
  PERFORM public._assert_no_slot_conflict(create_admin_manual_booking.business_id, NULL, v_starts_at, v_ends_at);
  v_manage_token := encode(extensions.gen_random_bytes(18), 'hex');

  INSERT INTO public.bookings (business_id, customer_id, service_id, starts_at, ends_at, manage_token, professional_id, created_by, status, notes, source)
  VALUES (create_admin_manual_booking.business_id, create_admin_manual_booking.client_id, create_admin_manual_booking.service_id, v_starts_at, v_ends_at, v_manage_token, create_admin_manual_booking.professional_id, create_admin_manual_booking.performed_by, 'booked', coalesce(create_admin_manual_booking.notes, create_admin_manual_booking.walk_in_name), 'admin-manual')
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'manage_token', v_manage_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_business_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_service_id text DEFAULT 'manual',
  p_customer_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capacity integer;
  v_occupied integer;
  v_appointment_id uuid;
  v_lock_key bigint;
  v_requester uuid;
  v_slot timestamptz;
  v_members_table regclass;
  v_is_owner boolean := false;
  v_is_member boolean := false;
BEGIN
  IF p_business_id IS NULL OR p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR';
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'UNAUTHORIZED'; END IF;
  v_requester := auth.uid();

  SELECT COALESCE(b.capacity, 1), COALESCE(b.owner_id = v_requester, false)
  INTO v_capacity, v_is_owner
  FROM public.businesses b
  WHERE b.id = p_business_id
  FOR UPDATE;

  IF v_capacity IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'BUSINESS_NOT_FOUND'; END IF;

  v_members_table := to_regclass('public.business_members');
  IF v_members_table IS NOT NULL THEN
    v_is_member := EXISTS (SELECT 1 FROM public.business_members WHERE business_id = p_business_id AND user_id = v_requester);
  END IF;

  IF NOT (v_is_owner OR v_is_member) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'UNAUTHORIZED'; END IF;

  v_lock_key := hashtextextended(p_business_id::text || ':business', 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  FOR v_slot IN SELECT gs FROM generate_series(date_trunc('minute', p_start_time), greatest(date_trunc('minute', p_end_time - interval '1 second'), date_trunc('minute', p_start_time)), interval '30 minutes') AS gs LOOP
    v_lock_key := hashtextextended(p_business_id::text || ':slot:' || v_slot::text, 0);
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  v_capacity := greatest(coalesce(v_capacity, 1), 1);
  SELECT count(*) INTO v_occupied
  FROM public.bookings b
  WHERE b.business_id = p_business_id
    AND b.status IN ('booked', 'confirmed')
    AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF v_capacity <= v_occupied THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'CAPACITY_FULL'; END IF;

  INSERT INTO public.bookings (business_id, customer_id, service_id, start_time, end_time, starts_at, ends_at, status, manage_token, notes)
  VALUES (p_business_id, p_customer_id, coalesce(nullif(p_service_id, ''), 'manual'), p_start_time, p_end_time, p_start_time, p_end_time, 'booked', encode(extensions.gen_random_bytes(18), 'hex'), p_notes)
  RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'status', 'booked', 'capacity', v_capacity, 'occupied', v_occupied + 1, 'remaining_capacity', greatest(v_capacity - (v_occupied + 1), 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders_24h()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.business_id, b.starts_at, c.email AS customer_email, c.full_name AS customer_name, biz.name AS business_name, s.name AS service_name
    FROM public.bookings b
    JOIN public.customers c ON c.id = b.customer_id
    JOIN public.businesses biz ON biz.id = b.business_id
    JOIN public.services s ON s.id::text = b.service_id
    JOIN public.business_settings bs ON bs.business_id = biz.id
    WHERE b.status IN ('booked', 'confirmed')
      AND b.starts_at > now() + interval '23 hours'
      AND b.starts_at < now() + interval '25 hours'
      AND bs.send_appointment_reminders_24h = true
      AND c.email IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = b.id AND neo.template_key = 'appointment_reminder_24h')
  LOOP
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    VALUES (r.business_id, r.id, r.customer_email, 'appointment_reminder_24h', jsonb_build_object('customer_name', r.customer_name, 'business_name', r.business_name, 'service_name', r.service_name, 'starts_at', r.starts_at));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_payment_webhook_event(
  p_provider text,
  p_provider_event_id text,
  p_request_id text,
  p_signature_ts bigint,
  p_signature_v1 text,
  p_resource_id text,
  p_action text,
  p_payload_hash text,
  p_replay_window_seconds integer DEFAULT 300
)
RETURNS TABLE(event_id uuid, decision text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing public.payment_webhook_events%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'reserve_payment_webhook_event is service-role only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO existing FROM public.payment_webhook_events WHERE provider = p_provider AND provider_event_id = p_provider_event_id FOR UPDATE;
  IF FOUND THEN
    event_id := existing.id;
    IF existing.payload_hash <> p_payload_hash THEN
      decision := 'payload_conflict';
    ELSIF existing.processing_state = 'processed' OR existing.processed_at IS NOT NULL THEN
      decision := 'duplicate_processed';
    ELSE
      UPDATE public.payment_webhook_events
      SET processing_state = 'reserved', failed_at = NULL, failure_reason = NULL, received_at = now(), request_id = p_request_id, signature_ts = p_signature_ts, signature_v1 = p_signature_v1, resource_id = p_resource_id, action = p_action, event_type = p_action
      WHERE id = existing.id;
      decision := 'retry';
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.payment_webhook_events(provider, provider_event_id, request_id, signature_ts, signature_v1, resource_id, action, event_type, payload_hash, replay_window_seconds, signature_valid, processing_state, received_at)
  VALUES (p_provider, p_provider_event_id, p_request_id, p_signature_ts, p_signature_v1, p_resource_id, p_action, p_action, p_payload_hash, p_replay_window_seconds, true, 'reserved', now())
  RETURNING id INTO event_id;
  decision := 'reserved';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_payment_webhook_event_state(p_provider text, p_provider_event_id text, p_state text, p_failure_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'mark_payment_webhook_event_state is service-role only' USING ERRCODE = '42501'; END IF;
  IF p_state NOT IN ('reserved', 'processing', 'processed', 'failed') THEN RAISE EXCEPTION 'invalid webhook processing state %', p_state USING ERRCODE = '22023'; END IF;

  UPDATE public.payment_webhook_events
  SET processing_state = p_state,
      processing_started_at = CASE WHEN p_state = 'processing' THEN now() ELSE processing_started_at END,
      processed_at = CASE WHEN p_state = 'processed' THEN now() ELSE processed_at END,
      failed_at = CASE WHEN p_state = 'failed' THEN now() ELSE NULL END,
      failure_reason = CASE WHEN p_state = 'failed' THEN p_failure_reason ELSE NULL END
  WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_public_slot_availability(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_public_availability_v2(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_admin_booking(uuid, uuid, text, text, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
