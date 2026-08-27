-- Issue #495: apply buffer_minutes and auto_confirm on public create,
-- count pending occupancy, and allow bookings.status = pending.

BEGIN;

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
    ADD CONSTRAINT bookings_status_check
    CHECK (status in ('confirmed', 'pending', 'cancelled', 'completed', 'no_show'));
END $$;

CREATE OR REPLACE FUNCTION public._read_business_booking_config(p_business_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'prep_buffer_minutes', bs.prep_buffer_minutes,
      'post_buffer_minutes', bs.post_buffer_minutes,
      'min_notice_minutes', bs.min_notice_minutes,
      'max_advance_days', bs.max_advance_days,
      'auto_assign_professional', bs.auto_assign_professional,
      'buffer_minutes', COALESCE(bs.buffer_minutes, 0),
      'auto_confirm', COALESCE(bs.auto_confirm, true)
    ) FROM public.business_settings bs WHERE bs.business_id = p_business_id),
    jsonb_build_object(
      'prep_buffer_minutes', 0,
      'post_buffer_minutes', 0,
      'min_notice_minutes', 0,
      'max_advance_days', 30,
      'auto_assign_professional', false,
      'buffer_minutes', 0,
      'auto_confirm', true
    )
  );
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

  SELECT GREATEST(COALESCE(bs.capacity, 1), 1)
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
    AND bk.status IN ('confirmed', 'pending')
    AND tstzrange(bk.starts_at, bk.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');

  IF v_capacity <= v_occupied THEN
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

CREATE OR REPLACE FUNCTION public._query_booking_slot_availability(
  p_business_id uuid,
  p_service_id uuid,
  p_date_iso text,
  p_branch_id uuid DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_exclude_booking_id uuid DEFAULT NULL,
  p_enforce_min_notice boolean DEFAULT true
)
RETURNS TABLE (starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  IF p_business_id IS NULL OR p_service_id IS NULL OR nullif(btrim(p_date_iso), '') IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  BEGIN
    v_target_date := p_date_iso::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  SELECT b.timezone,
         COALESCE(bs.capacity, 1),
         COALESCE(bs.slot_interval_minutes, 30),
         COALESCE(bs.buffer_minutes, 0),
         COALESCE(bs.min_notice_minutes, 0),
         '{
           "monday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "tuesday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "wednesday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "thursday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "friday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "saturday": {"enabled": true, "start": "09:00", "end": "18:00"},
           "sunday": {"enabled": false, "start": "00:00", "end": "00:00"}
         }'::jsonb || COALESCE(bs.working_hours, '{}'::jsonb)
  INTO v_timezone, v_capacity, v_slot_interval, v_buffer_minutes, v_min_notice_minutes, v_working_hours
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = p_business_id;

  IF v_capacity IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branches br
    WHERE br.id = p_branch_id
      AND br.business_id = p_business_id
      AND COALESCE(br.is_active, true) = true
  ) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT COALESCE(p_duration_minutes, s.duration_minutes)
  INTO v_duration_minutes
  FROM public.services s
  WHERE s.id = p_service_id
    AND s.business_id = p_business_id
    AND COALESCE(s.is_active, true) = true;

  IF v_duration_minutes IS NULL THEN
    PERFORM public._raise_rpc('SERVICE_NOT_FOUND');
  END IF;

  IF v_duration_minutes <= 0 OR v_capacity <= 0 OR v_slot_interval <= 0 OR v_buffer_minutes < 0 OR v_min_notice_minutes < 0 THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

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

  BEGIN
    IF v_day_settings IS NULL OR NOT COALESCE((v_day_settings->>'enabled')::boolean, false) THEN
      RETURN;
    END IF;

    v_start_time := (v_day_settings->>'start')::time;
    v_end_time := (v_day_settings->>'end')::time;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF v_start_time IS NULL OR v_end_time IS NULL OR v_end_time <= v_start_time THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_slot_start := timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_start_time)::timestamp);

  WHILE (v_slot_start + make_interval(mins => v_duration_minutes)) <= timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_end_time)::timestamp) LOOP
    v_slot_end := v_slot_start + make_interval(mins => v_duration_minutes);

    IF p_enforce_min_notice IS NOT TRUE OR v_slot_start >= (v_now + make_interval(mins => v_min_notice_minutes)) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.blocked_times bt
        WHERE bt.business_id = p_business_id
          AND (p_branch_id IS NULL OR bt.branch_id IS NULL OR bt.branch_id = p_branch_id)
          AND tstzrange(bt.starts_at, bt.ends_at, '[)') && tstzrange(v_slot_start, v_slot_end, '[)')
      ) THEN
        SELECT count(*)
        INTO v_booking_count
        FROM public.bookings bk
        WHERE bk.business_id = p_business_id
          AND (p_branch_id IS NULL OR bk.branch_id = p_branch_id)
          AND (p_exclude_booking_id IS NULL OR bk.id <> p_exclude_booking_id)
          AND bk.status IN ('confirmed', 'pending')
          AND (bk.starts_at - make_interval(mins => v_buffer_minutes)) < v_slot_end
          AND (bk.ends_at + make_interval(mins => v_buffer_minutes)) > v_slot_start;

        IF v_capacity > v_booking_count THEN
          starts_at_iso := v_slot_start::text;
          ends_at_iso := v_slot_end::text;
          remaining_capacity := v_capacity - v_booking_count;
          RETURN NEXT;
        END IF;
      END IF;
    END IF;

    v_slot_start := v_slot_start + make_interval(mins => v_slot_interval);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._query_booking_slot_availability(uuid, uuid, text, uuid, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;

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
  v_business_name text;
  v_service_id uuid;
  v_branch_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
  v_timezone text;
  v_availability_date text;
  v_matching_slot_count integer;
  v_management_bearer text := encode(extensions.gen_random_bytes(32), 'hex');
  v_customer_name text;
  v_customer_email text;
  v_customer_phone text;
  v_service_name text;
  v_business_email text;
  v_business_email_outbox_enqueued boolean := false;
  v_account_closed_at timestamptz;
  v_config jsonb;
  v_buffer_minutes int;
  v_min_notice int;
  v_max_advance int;
  v_auto_confirm boolean;
  v_status text;
  v_effective_start timestamptz;
  v_effective_end timestamptz;
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  END IF;

  SELECT b.id, b.timezone, b.name, b.account_closed_at INTO v_business_id, v_timezone, v_business_name, v_account_closed_at
  FROM public.businesses b
  WHERE b.slug = create_public_booking.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(create_public_booking.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF v_account_closed_at IS NOT NULL THEN
    PERFORM public._raise_rpc('BUSINESS_ACCOUNT_CLOSED');
  END IF;

  PERFORM public._assert_business_accepts_public_bookings(v_business_id);

  -- Resolve is optional: a missing recipient must not abort the booking.
  v_business_email := public._resolve_booking_business_email(v_business_id);

  BEGIN
    v_service_id := create_public_booking.service_id::uuid;
    v_branch_id := nullif(btrim(create_public_booking.branch_id), '')::uuid;
    v_starts_at := create_public_booking.starts_at_iso::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  IF v_branch_id IS NULL THEN
    SELECT br.id INTO v_branch_id
    FROM public.branches br
    WHERE br.business_id = v_business_id
      AND br.slug = 'principal'
      AND COALESCE(br.is_active, true) = true
    ORDER BY br.created_at ASC, br.id ASC
    LIMIT 1;

    IF v_branch_id IS NULL THEN
      PERFORM public._raise_rpc('BOOKING_BRANCH_CONFIGURATION_REQUIRED');
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.branches br
    WHERE br.id = v_branch_id
      AND br.business_id = v_business_id
      AND COALESCE(br.is_active, true) = true
  ) THEN
    PERFORM public._raise_rpc('BRANCH_TENANT_MISMATCH');
  END IF;

  SELECT s.duration_minutes, s.name INTO v_duration_minutes, v_service_name
  FROM public.services s
  WHERE s.id = v_service_id
    AND s.business_id = v_business_id
    AND COALESCE(s.is_active, true) = true;

  IF v_duration_minutes IS NULL THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  v_customer_name := nullif(btrim(client->>'fullName'), '');
  v_customer_email := nullif(btrim(client->>'email'), '');
  v_customer_phone := nullif(btrim(client->>'phone'), '');

  IF v_customer_name IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  v_ends_at := v_starts_at + make_interval(mins => v_duration_minutes);
  v_availability_date := ((v_starts_at AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date)::text;

  v_config := public._read_business_booking_config(v_business_id);
  v_buffer_minutes := COALESCE((v_config->>'buffer_minutes')::int, 0);
  v_min_notice := (v_config->>'min_notice_minutes')::int;
  v_max_advance := (v_config->>'max_advance_days')::int;
  v_auto_confirm := COALESCE((v_config->>'auto_confirm')::boolean, true);
  v_status := CASE WHEN v_auto_confirm THEN 'confirmed' ELSE 'pending' END;

  IF v_starts_at < now() + make_interval(mins => v_min_notice) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_SOON');
  END IF;

  IF v_starts_at > now() + make_interval(days => v_max_advance) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_FAR_ADVANCE');
  END IF;

  PERFORM NULLIF(v_config->>'auto_assign_professional', 'false');

  SELECT count(*) INTO v_matching_slot_count
  FROM public._query_booking_slot_availability(v_business_id, v_service_id, v_availability_date, v_branch_id, NULL, NULL, true) AS availability
  WHERE availability.starts_at_iso::timestamptz = v_starts_at
    AND availability.remaining_capacity > 0;

  IF v_matching_slot_count < 1 THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

  PERFORM public._lock_booking_conflict_window(v_business_id, v_branch_id, v_starts_at, v_ends_at);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

  v_effective_start := v_starts_at - make_interval(mins => v_buffer_minutes);
  v_effective_end := v_ends_at + make_interval(mins => v_buffer_minutes);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_effective_start, v_effective_end);

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, v_customer_name, v_customer_email, v_customer_phone)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, v_status, NULLIF(btrim(notes), ''),
    public._hash_manage_token(v_management_bearer), v_ends_at + interval '1 hour', 'client-self-service'
  )
  RETURNING id INTO v_booking_id;

  IF v_customer_email IS NOT NULL AND v_status = 'confirmed' THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT v_business_id, v_booking_id, v_customer_email, 'appointment_confirmation', jsonb_build_object(
      'booking_id', v_booking_id,
      'starts_at', v_starts_at,
      'customer_name', v_customer_name,
      'service_name', v_service_name,
      'links', jsonb_build_object(
        'view', '/booking/manage?token=' || v_management_bearer,
        'cancel', '/booking/manage?token=' || v_management_bearer || '&action=cancel',
        'reschedule', '/booking/manage?token=' || v_management_bearer || '&action=reschedule'
      )
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = v_booking_id AND neo.template_key = 'appointment_confirmation'
    );
  END IF;

  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  VALUES (
    v_business_id,
    v_booking_id,
    'appointment.created',
    'Nuevo turno',
    'El cliente ' || v_customer_name || ' reservó ' || COALESCE(v_service_name, 'Servicio') || '.',
    jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', v_starts_at)
  );

  v_business_email_outbox_enqueued := false;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'status', v_status,
    'manage_token', v_management_bearer,
    'source', 'client-self-service',
    'db_atomic_visibility_notifications', true,
    'business_email_outbox_enqueued', v_business_email_outbox_enqueued
  );
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

REVOKE ALL ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
