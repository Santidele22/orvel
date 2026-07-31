-- Orvel dashboard MVP phase 1 booking contracts.
-- RPCs are the source of truth for availability, collisions, and public management.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS manage_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days');

CREATE INDEX IF NOT EXISTS bookings_manage_token_active_idx
  ON public.bookings(manage_token)
  WHERE status NOT IN ('cancelled', 'rejected');

DROP POLICY IF EXISTS "Public view own booking" ON public.bookings;

DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, uuid, text);
DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, text, text);
DROP FUNCTION IF EXISTS public.create_admin_manual_booking(uuid, uuid, text, text, integer, text, text, text, text, text);

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
  SELECT b.id, b.timezone, COALESCE(b.capacity, 1)
  INTO v_business_id, v_timezone, v_capacity
  FROM public.businesses b
  WHERE b.slug ILIKE business_slug;

  IF v_business_id IS NULL THEN RETURN; END IF;

  BEGIN v_service_id := service_id::uuid; EXCEPTION WHEN OTHERS THEN RETURN; END;

  SELECT s.duration_minutes INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id AND s.business_id = v_business_id AND s.is_active = true;
  IF v_duration_minutes IS NULL THEN RETURN; END IF;

  SELECT COALESCE(bs.slot_interval_minutes, 30), COALESCE(bs.buffer_minutes, 10), COALESCE(bs.min_notice_minutes, 120), bs.working_hours
  INTO v_slot_interval, v_buffer_minutes, v_min_notice_minutes, v_working_hours
  FROM public.business_settings bs
  WHERE bs.business_id = v_business_id;
  IF v_working_hours IS NULL THEN RETURN; END IF;

  BEGIN v_target_date := date_iso::date; EXCEPTION WHEN OTHERS THEN RETURN; END;

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

  WHILE (v_slot_start + (v_duration_minutes || ' minutes')::interval) <= timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_end_time)::timestamp) LOOP
    v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;

    SELECT count(*) INTO v_booking_count
    FROM public.bookings bk
    WHERE bk.business_id = v_business_id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND (bk.starts_at - (v_buffer_minutes || ' minutes')::interval) < v_slot_end
      AND (bk.ends_at + (v_buffer_minutes || ' minutes')::interval) > v_slot_start;

    IF v_slot_start >= (v_now + (v_min_notice_minutes || ' minutes')::interval)
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_times bt
        WHERE bt.business_id = v_business_id
          AND bt.starts_at < v_slot_end
          AND bt.ends_at > v_slot_start
      )
    THEN
      starts_at_iso := v_slot_start::text;
      ends_at_iso := v_slot_end::text;
      remaining_capacity := GREATEST(0, v_capacity - v_booking_count);
      RETURN NEXT;
    END IF;

    v_slot_start := v_slot_start + (v_slot_interval || ' minutes')::interval;
  END LOOP;
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
BEGIN
  SELECT b.id INTO v_business_id FROM public.businesses b WHERE b.slug ILIKE business_slug;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;

  BEGIN v_service_id := service_id::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  SELECT s.duration_minutes INTO v_duration_minutes FROM public.services s WHERE s.id = v_service_id AND s.business_id = v_business_id AND s.is_active = true;
  IF v_duration_minutes IS NULL THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END IF;
  BEGIN v_starts_at := starts_at_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  v_ends_at := v_starts_at + (v_duration_minutes || ' minutes')::interval;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    RAISE EXCEPTION 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
    WHERE bk.business_id = v_business_id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_times bt
    WHERE bt.business_id = v_business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, btrim(client->>'fullName'), NULLIF(btrim(client->>'email'), ''), NULLIF(btrim(client->>'phone'), ''))
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (business_id, customer_id, service_id, starts_at, ends_at, status, notes, manage_token, manage_token_expires_at)
  VALUES (v_business_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, 'booked', NULLIF(btrim(notes), ''), encode(gen_random_bytes(32), 'hex'), v_starts_at + interval '30 days')
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'confirmed');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  client_id text DEFAULT NULL,
  walk_in_name text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  performed_by text DEFAULT NULL,
  notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_business_owner(business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT br.id INTO v_branch_id
  FROM public.branches br
  WHERE br.business_id = create_admin_manual_booking.business_id
    AND br.is_active = true
  ORDER BY (br.slug = 'principal' OR br.slug = 'default' OR br.name ILIKE '%principal%') DESC, br.created_at ASC
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches (business_id, name, slug, is_active)
    VALUES (business_id, 'Sucursal principal', 'principal', true)
    RETURNING id INTO v_branch_id;
  END IF;

  BEGIN v_service_id := service_id::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_SERVICE'; END;
  SELECT COALESCE(NULLIF(duration_minutes, 0), s.duration_minutes)
  INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = v_service_id AND s.business_id = create_admin_manual_booking.business_id AND s.is_active = true;
  IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN RAISE EXCEPTION 'INVALID_DURATION'; END IF;
  BEGIN v_starts_at := starts_at_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_STARTS_AT'; END;
  v_ends_at := v_starts_at + (v_duration_minutes || ' minutes')::interval;

  IF client_id IS NOT NULL AND btrim(client_id) <> '' THEN
    BEGIN v_customer_id := client_id::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'INVALID_CLIENT'; END;
    IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = v_customer_id AND c.business_id = create_admin_manual_booking.business_id) THEN
      RAISE EXCEPTION 'INVALID_CLIENT';
    END IF;
  ELSIF walk_in_name IS NOT NULL AND btrim(walk_in_name) <> '' THEN
    INSERT INTO public.customers (business_id, full_name)
    VALUES (business_id, btrim(walk_in_name))
    RETURNING id INTO v_customer_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
    WHERE bk.business_id = create_admin_manual_booking.business_id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_times bt
    WHERE bt.business_id = create_admin_manual_booking.business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, professional_id, notes)
  VALUES (business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, 'booked', NULLIF(btrim(professional_id), ''), NULLIF(btrim(notes), ''))
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'branch_id', v_branch_id, 'starts_at_iso', v_starts_at::text, 'ends_at_iso', v_ends_at::text, 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_blocked_time(
  business_id uuid,
  starts_at_iso text,
  ends_at_iso text,
  reason text DEFAULT NULL,
  performed_by text DEFAULT NULL
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
  IF auth.role() <> 'service_role' AND NOT public.is_business_owner(business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  BEGIN v_starts_at := starts_at_iso::timestamptz; v_ends_at := ends_at_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  IF v_ends_at <= v_starts_at THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
    WHERE bk.business_id = create_admin_blocked_time.business_id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_times bt
    WHERE bt.business_id = create_admin_blocked_time.business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.blocked_times (business_id, starts_at, ends_at, reason)
  VALUES (business_id, v_starts_at, v_ends_at, NULLIF(btrim(reason), ''))
  RETURNING id INTO v_block_id;

  RETURN jsonb_build_object('block_id', v_block_id, 'type', 'blocked-time', 'performed_by', performed_by);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_booking_by_token(token text, now_iso text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking record;
BEGIN
  BEGIN v_now := now_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;

  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.manage_token = token;

  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF v_booking.manage_token_expires_at <= v_now THEN RAISE EXCEPTION 'TOKEN_EXPIRED'; END IF;
  IF v_booking.starts_at <= v_now + interval '60 minutes' THEN RAISE EXCEPTION 'POLICY_WINDOW_CLOSED'; END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at::text,
    'can_cancel_or_reschedule', true
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
  v_booking record;
BEGIN
  BEGIN v_now := now_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  SELECT bk.* INTO v_booking FROM public.bookings bk WHERE bk.manage_token = token;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF v_booking.manage_token_expires_at <= v_now THEN RAISE EXCEPTION 'TOKEN_EXPIRED'; END IF;
  IF v_booking.starts_at <= v_now + interval '60 minutes' THEN RAISE EXCEPTION 'POLICY_WINDOW_CLOSED'; END IF;

  UPDATE public.bookings SET status = 'cancelled', updated_at = now() WHERE id = v_booking.id;
  RETURN jsonb_build_object('booking_id', v_booking.id, 'status', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_admin_booking(
  booking_id uuid,
  starts_at_iso text,
  performed_by text DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
BEGIN
  SELECT bk.* INTO v_booking FROM public.bookings bk WHERE bk.id = booking_id;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'INVALID_BOOKING'; END IF;
  IF auth.role() <> 'service_role' AND NOT public.is_business_owner(v_booking.business_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  BEGIN v_starts_at := starts_at_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  v_ends_at := v_starts_at + (v_booking.ends_at - v_booking.starts_at);

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
    WHERE bk.business_id = v_booking.business_id
      AND bk.id <> v_booking.id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_times bt
    WHERE bt.business_id = v_booking.business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  UPDATE public.bookings
  SET starts_at = v_starts_at, ends_at = v_ends_at, notes = COALESCE(NULLIF(btrim(notes), ''), public.bookings.notes), updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_starts_at::text, 'performed_by', performed_by, 'reason', reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking_by_token(token text, now_iso text, starts_at_iso text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz;
  v_booking record;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
BEGIN
  BEGIN v_now := now_iso::timestamptz; v_starts_at := starts_at_iso::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'BOOKING_VALIDATION_ERROR'; END;
  SELECT bk.* INTO v_booking FROM public.bookings bk WHERE bk.manage_token = token;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN'; END IF;
  IF v_booking.manage_token_expires_at <= v_now THEN RAISE EXCEPTION 'TOKEN_EXPIRED'; END IF;
  IF v_booking.starts_at <= v_now + interval '60 minutes' THEN RAISE EXCEPTION 'POLICY_WINDOW_CLOSED'; END IF;
  v_ends_at := v_starts_at + (v_booking.ends_at - v_booking.starts_at);

  IF EXISTS (
    SELECT 1 FROM public.bookings bk
    WHERE bk.business_id = v_booking.business_id
      AND bk.id <> v_booking.id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) OR EXISTS (
    SELECT 1 FROM public.blocked_times bt
    WHERE bt.business_id = v_booking.business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  UPDATE public.bookings SET starts_at = v_starts_at, ends_at = v_ends_at, updated_at = now() WHERE id = v_booking.id;
  RETURN jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_starts_at::text);
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
