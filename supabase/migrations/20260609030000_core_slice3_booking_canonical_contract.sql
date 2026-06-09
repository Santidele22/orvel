-- Core Slice 3 canonical booking backend contract.
-- Forward-only remediation after MVP phase drift: Supabase owns M1-M6
-- availability, collision, status, and public management token semantics.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP INDEX IF EXISTS public.bookings_manage_token_active_idx;
DROP POLICY IF EXISTS "Public view own booking" ON public.bookings;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS manage_token_hash text,
  ADD COLUMN IF NOT EXISTS manage_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS manage_token_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client-self-service';

UPDATE public.bookings
SET status = CASE
  WHEN status = 'booked' THEN 'confirmed'
  WHEN status = 'rejected' THEN 'cancelled'
  WHEN status IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN status
  ELSE 'confirmed'
END
WHERE status IS DISTINCT FROM CASE
  WHEN status = 'booked' THEN 'confirmed'
  WHEN status = 'rejected' THEN 'cancelled'
  WHEN status IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN status
  ELSE 'confirmed'
END;

UPDATE public.bookings
SET manage_token_hash = encode(extensions.digest(manage_token, 'sha256'), 'hex')
WHERE manage_token_hash IS NULL
  AND manage_token IS NOT NULL
  AND btrim(manage_token) <> '';

UPDATE public.bookings
SET manage_token_expires_at = ends_at + interval '1 hour'
WHERE manage_token_hash IS NOT NULL
  AND manage_token_expires_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'bookings_status_check'
  ) THEN
    ALTER TABLE public.bookings DROP CONSTRAINT bookings_status_check;
  END IF;

  ALTER TABLE public.bookings
    ALTER COLUMN status SET DEFAULT 'confirmed';

  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_status_check
    CHECK (status in ('confirmed', 'cancelled', 'completed', 'no_show'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_manage_token_hash_active_idx
  ON public.bookings (manage_token_hash)
  WHERE manage_token_hash IS NOT NULL AND manage_token_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS bookings_canonical_active_overlap_idx
  ON public.bookings (business_id, branch_id, starts_at, ends_at)
  WHERE status = 'confirmed';

CREATE OR REPLACE FUNCTION public._raise_rpc(p_code text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING errcode = 'P0001', message = p_code;
END;
$$;

CREATE OR REPLACE FUNCTION public._hash_manage_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._booking_duration(p_service_id uuid, p_fallback integer DEFAULT 30)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT duration_minutes FROM public.services WHERE id = p_service_id), p_fallback, 30);
$$;

CREATE OR REPLACE FUNCTION public._assert_no_slot_conflict(
  p_business_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_occupied integer;
BEGIN
  IF p_business_id IS NULL OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT COALESCE(bs.capacity, b.capacity, 1)
  INTO v_capacity
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = p_business_id;

  IF v_capacity IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  SELECT count(*)
  INTO v_occupied
  FROM public.bookings bk
  WHERE bk.business_id = p_business_id
    AND (p_branch_id IS NULL OR bk.branch_id = p_branch_id)
    AND (p_exclude_booking_id IS NULL OR bk.id <> p_exclude_booking_id)
    AND bk.status = 'confirmed'
    AND tstzrange(bk.starts_at, bk.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');

  IF COALESCE(v_capacity, 1) <= v_occupied THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_times bt
    WHERE bt.business_id = p_business_id
      AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
      AND tstzrange(bt.starts_at, bt.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    PERFORM public._raise_rpc('BLOCKED_TIME_COLLISION');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._load_manageable_booking(p_token text, p_now timestamptz)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF nullif(btrim(p_token), '') IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings bk
  WHERE bk.manage_token_hash = public._hash_manage_token(p_token)
    AND bk.manage_token_revoked_at IS NULL
  LIMIT 1;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('INVALID_TOKEN');
  END IF;

  IF v_booking.manage_token_expires_at IS NULL OR v_booking.manage_token_expires_at <= p_now THEN
    PERFORM public._raise_rpc('TOKEN_EXPIRED');
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  RETURN v_booking;
END;
$$;

DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, uuid, text);
DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, text, text);

CREATE OR REPLACE FUNCTION public.query_public_slot_availability(business_slug text, service_id text, date_iso text)
RETURNS TABLE (starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_target_date date;
  v_working_hours jsonb;
  v_day_key text;
  v_day_settings jsonb;
  v_slot_interval integer;
  v_buffer_minutes integer;
  v_min_notice_minutes integer;
  v_duration_minutes integer;
  v_capacity integer;
  v_start_time time;
  v_end_time time;
  v_timezone text;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_booking_count integer;
  v_now timestamptz := now();
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR nullif(btrim(date_iso), '') IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT b.id, b.timezone, COALESCE(bs.capacity, b.capacity, 1),
         COALESCE(bs.slot_interval_minutes, 30), COALESCE(bs.buffer_minutes, 0), COALESCE(bs.min_notice_minutes, 0), bs.working_hours
  INTO v_business_id, v_timezone, v_capacity, v_slot_interval, v_buffer_minutes, v_min_notice_minutes, v_working_hours
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.slug = business_slug OR b.slug_canonical = public.canonical_booking_slug(business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('BUSINESS_NOT_FOUND'); END IF;

  BEGIN
    v_service_id := service_id::uuid;
    v_target_date := date_iso::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  SELECT s.duration_minutes
  INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id AND s.business_id = v_business_id AND COALESCE(s.is_active, s.active, true) = true;

  IF v_duration_minutes IS NULL THEN PERFORM public._raise_rpc('INVALID_SERVICE'); END IF;
  IF v_working_hours IS NULL THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  CASE extract(dow from v_target_date)
    WHEN 0 THEN v_day_key := 'sunday';
    WHEN 1 THEN v_day_key := 'monday';
    WHEN 2 THEN v_day_key := 'tuesday';
    WHEN 3 THEN v_day_key := 'wednesday';
    WHEN 4 THEN v_day_key := 'thursday';
    WHEN 5 THEN v_day_key := 'friday';
    WHEN 6 THEN v_day_key := 'saturday';
  END CASE;

  v_day_settings := v_working_hours->v_day_key;
  IF v_day_settings IS NULL OR NOT COALESCE((v_day_settings->>'enabled')::boolean, false) THEN RETURN; END IF;

  v_start_time := (v_day_settings->>'start')::time;
  v_end_time := (v_day_settings->>'end')::time;
  v_slot_start := timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_start_time)::timestamp);

  WHILE (v_slot_start + make_interval(mins => v_duration_minutes)) <= timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_end_time)::timestamp) LOOP
    v_slot_end := v_slot_start + make_interval(mins => v_duration_minutes);
    v_booking_count := 0;

    IF v_slot_start >= (v_now + make_interval(mins => v_min_notice_minutes)) THEN
      BEGIN
        PERFORM public._assert_no_slot_conflict(v_business_id, NULL, v_slot_start, v_slot_end);

        SELECT count(*)
        INTO v_booking_count
        FROM public.bookings bk
        WHERE bk.business_id = v_business_id
          AND bk.status = 'confirmed'
          AND (bk.starts_at - make_interval(mins => v_buffer_minutes)) < v_slot_end
          AND (bk.ends_at + make_interval(mins => v_buffer_minutes)) > v_slot_start;

        starts_at_iso := v_slot_start::text;
        ends_at_iso := v_slot_end::text;
        remaining_capacity := GREATEST(0, v_capacity - v_booking_count);
        RETURN NEXT;
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        NULL;
      END;
    END IF;

    v_slot_start := v_slot_start + make_interval(mins => v_slot_interval);
  END LOOP;
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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
  v_manage_token text := encode(gen_random_bytes(32), 'base64url');
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  END IF;

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = business_slug OR b.slug_canonical = public.canonical_booking_slug(business_slug)
  LIMIT 1;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('BUSINESS_NOT_FOUND'); END IF;

  BEGIN
    v_service_id := service_id::uuid;
    v_branch_id := nullif(btrim(branch_id), '')::uuid;
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  SELECT s.duration_minutes INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id AND s.business_id = v_business_id AND COALESCE(s.is_active, s.active, true) = true;
  IF v_duration_minutes IS NULL THEN PERFORM public._raise_rpc('INVALID_SERVICE'); END IF;
  IF nullif(btrim(client->>'fullName'), '') IS NULL THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;

  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, btrim(client->>'fullName'), NULLIF(btrim(client->>'email'), ''), NULLIF(btrim(client->>'phone'), ''))
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, 'confirmed', NULLIF(btrim(notes), ''),
    public._hash_manage_token(v_manage_token), v_ends_at + interval '1 hour', 'client-self-service'
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'confirmed', 'manage_token', v_manage_token, 'source', 'client-self-service');
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking public.bookings;
  v_window integer;
BEGIN
  BEGIN v_now := now_iso::timestamptz; EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END;
  v_booking := public._load_manageable_booking(token, v_now);
  SELECT COALESCE(cancellation_window_minutes, 60) INTO v_window FROM public.business_settings WHERE business_id = v_booking.business_id;
  IF v_booking.starts_at <= v_now THEN PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED'); END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'can_cancel_or_reschedule', v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) > v_now,
    'status', 'confirmed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking public.bookings;
  v_window integer;
  v_allowed boolean;
BEGIN
  BEGIN v_now := now_iso::timestamptz; EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END;
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60), COALESCE(allow_client_cancel, true)
  INTO v_window, v_allowed
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF COALESCE(v_allowed, true) IS NOT true OR v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled', manage_token_revoked_at = COALESCE(manage_token_revoked_at, now()), updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'status', 'cancelled');
END;
$$;

DROP FUNCTION IF EXISTS public.create_admin_manual_booking(uuid, uuid, text, text, integer, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, text, text);

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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;
  BEGIN
    v_service_id := service_id::uuid;
    v_customer_id := nullif(btrim(client_id), '')::uuid;
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;
  IF duration_minutes IS NULL OR duration_minutes <= 0 THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  v_ends_at := v_starts_at + make_interval(mins => duration_minutes);
  PERFORM public._assert_no_slot_conflict(business_id, branch_id, v_starts_at, v_ends_at);

  IF v_customer_id IS NULL AND nullif(btrim(walk_in_name), '') IS NOT NULL THEN
    INSERT INTO public.customers (business_id, full_name) VALUES (business_id, btrim(walk_in_name)) RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, professional_id, notes, source)
  VALUES (business_id, branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, 'confirmed', NULLIF(btrim(professional_id), ''), NULLIF(btrim(notes), ''), 'admin-manual')
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'type', 'manual-admin-appointment', 'status', 'confirmed', 'source', 'admin-manual');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_booking(booking_id uuid, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT bk.business_id INTO v_business_id FROM public.bookings bk WHERE bk.id = booking_id;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  UPDATE public.bookings
  SET notes = COALESCE(NULLIF(btrim(notes), ''), public.bookings.notes), updated_at = now()
  WHERE id = booking_id;

  RETURN jsonb_build_object('booking_id', booking_id, 'updated_at', now(), 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_admin_booking(booking_id uuid, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT bk.business_id INTO v_business_id FROM public.bookings bk WHERE bk.id = booking_id;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  UPDATE public.bookings
  SET status = 'cancelled', notes = COALESCE(NULLIF(btrim(notes), ''), public.bookings.notes), updated_at = now()
  WHERE id = booking_id AND status = 'confirmed';

  RETURN jsonb_build_object('booking_id', booking_id, 'status', 'cancelled', 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by uuid DEFAULT NULL, notes text DEFAULT NULL, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
BEGIN
  SELECT * INTO v_booking FROM public.bookings bk WHERE bk.id = booking_id;
  IF v_booking.id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;
  IF v_booking.status <> 'confirmed' THEN PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED'); END IF;
  BEGIN v_starts_at := starts_at_iso::timestamptz; EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END;
  v_ends_at := v_starts_at + (v_booking.ends_at - v_booking.starts_at);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings
  SET starts_at = v_starts_at, ends_at = v_ends_at, notes = COALESCE(NULLIF(btrim(notes), ''), public.bookings.notes), updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_starts_at::text, 'reason', reason, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_booking_status(booking_id uuid, status text, performed_by uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF status NOT IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  SELECT bk.business_id INTO v_business_id FROM public.bookings bk WHERE bk.id = booking_id;
  IF v_business_id IS NULL THEN PERFORM public._raise_rpc('INVALID_BOOKING'); END IF;
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;

  UPDATE public.bookings SET status = update_booking_status.status, updated_at = now() WHERE id = booking_id;
  RETURN jsonb_build_object('booking_id', booking_id, 'status', status, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_blocked_time(
  business_id uuid,
  starts_at_iso text,
  ends_at_iso text,
  reason text DEFAULT NULL,
  performed_by uuid DEFAULT NULL,
  branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_block_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(business_id) THEN PERFORM public._raise_rpc('UNAUTHORIZED'); END IF;
  BEGIN
    v_starts_at := starts_at_iso::timestamptz;
    v_ends_at := ends_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;
  IF v_ends_at <= v_starts_at THEN PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR'); END IF;
  PERFORM public._assert_no_slot_conflict(business_id, branch_id, v_starts_at, v_ends_at);

  INSERT INTO public.blocked_times (business_id, branch_id, starts_at, ends_at, reason)
  VALUES (business_id, branch_id, v_starts_at, v_ends_at, NULLIF(btrim(reason), ''))
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object('blocked_time_id', v_block_id, 'block_id', v_block_id, 'type', 'blocked-time', 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking_by_token(token text, now_iso text, starts_at_iso text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking public.bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_window integer;
  v_allowed boolean;
BEGIN
  BEGIN
    v_now := now_iso::timestamptz;
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;
  v_booking := public._load_manageable_booking(token, v_now);

  SELECT COALESCE(cancellation_window_minutes, 60), COALESCE(allow_client_reschedule, true)
  INTO v_window, v_allowed
  FROM public.business_settings
  WHERE business_id = v_booking.business_id;

  IF COALESCE(v_allowed, true) IS NOT true OR v_booking.starts_at - make_interval(mins => COALESCE(v_window, 60)) <= v_now THEN
    PERFORM public._raise_rpc('POLICY_WINDOW_CLOSED');
  END IF;

  v_ends_at := v_starts_at + (v_booking.ends_at - v_booking.starts_at);
  PERFORM public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_starts_at, v_ends_at, v_booking.id);

  UPDATE public.bookings
  SET starts_at = v_starts_at, ends_at = v_ends_at, manage_token_expires_at = v_ends_at + interval '1 hour', updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_starts_at::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_public_slot_availability(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_booking(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_booking_status(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_blocked_time(uuid, text, text, text, uuid, uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
