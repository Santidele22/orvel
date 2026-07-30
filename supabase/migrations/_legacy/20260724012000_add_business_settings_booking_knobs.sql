-- Orvel 1.0.2: Add booking config knobs to business_settings
-- Adds prep_buffer_minutes, post_buffer_minutes, max_advance_days,
-- auto_assign_professional columns, and updates create_public_booking
-- to read and respect these knobs.

BEGIN;

-- ── Migration: add 4 columns with safe defaults ───────────────────────────
ALTER TABLE ONLY public.business_settings
  ADD COLUMN IF NOT EXISTS prep_buffer_minutes INT NOT NULL DEFAULT 0 CHECK (prep_buffer_minutes >= 0),
  ADD COLUMN IF NOT EXISTS post_buffer_minutes INT NOT NULL DEFAULT 0 CHECK (post_buffer_minutes >= 0),
  ADD COLUMN IF NOT EXISTS max_advance_days INT NOT NULL DEFAULT 30 CHECK (max_advance_days >= 0),
  ADD COLUMN IF NOT EXISTS auto_assign_professional BOOLEAN NOT NULL DEFAULT false;

-- ── Helper: read business booking config knobs ───────────────────────────
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
      'auto_assign_professional', bs.auto_assign_professional
    ) FROM public.business_settings bs WHERE bs.business_id = p_business_id),
    jsonb_build_object(
      'prep_buffer_minutes', 0,
      'post_buffer_minutes', 0,
      'min_notice_minutes', 0,
      'max_advance_days', 30,
      'auto_assign_professional', false
    )
  );
$$;

-- ── Redefine create_public_booking to read and respect booking knobs ──────
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
  v_account_closed_at timestamptz;
  v_config jsonb;
  v_prep_buffer int;
  v_post_buffer int;
  v_min_notice int;
  v_max_advance int;
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

  v_business_email := public._resolve_booking_business_email(v_business_id);
  IF v_business_email IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_EMAIL_RECIPIENT_REQUIRED');
  END IF;

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

  -- Read booking config knobs
  v_config := public._read_business_booking_config(v_business_id);
  v_prep_buffer := (v_config->>'prep_buffer_minutes')::int;
  v_post_buffer := (v_config->>'post_buffer_minutes')::int;
  v_min_notice := (v_config->>'min_notice_minutes')::int;
  v_max_advance := (v_config->>'max_advance_days')::int;

  -- Validate min_notice: reservation too soon
  IF v_starts_at < now() + make_interval(mins => v_min_notice) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_SOON');
  END IF;

  -- Validate max_advance: reservation too far in the future
  IF v_starts_at > now() + make_interval(days => v_max_advance) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_FAR_ADVANCE');
  END IF;

  -- Read auto_assign_professional (v1: log only, no assignment)
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

  -- Apply prep/post buffer to the effective slot window for conflict detection
  v_effective_start := v_starts_at - make_interval(mins => v_prep_buffer);
  v_effective_end := v_ends_at + make_interval(mins => v_post_buffer);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_effective_start, v_effective_end);

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, v_customer_name, v_customer_email, v_customer_phone)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id::text, v_starts_at, v_ends_at, 'confirmed', NULLIF(btrim(notes), ''),
    public._hash_manage_token(v_management_bearer), v_ends_at + interval '1 hour', 'client-self-service'
  )
  RETURNING id INTO v_booking_id;

  -- customer email outbox (if customer has email)
  IF v_customer_email IS NOT NULL THEN
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

  -- dashboard_notifications — required
  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  VALUES (
    v_business_id,
    v_booking_id,
    'appointment.created',
    'Nuevo turno',
    'El cliente ' || v_customer_name || ' reservó ' || COALESCE(v_service_name, 'Servicio') || '.',
    jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', v_starts_at)
  );

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'status', 'confirmed',
    'manage_token', v_management_bearer,
    'source', 'client-self-service',
    'db_atomic_visibility_notifications', true,
    'business_email_outbox_enqueued', true
  );
END;
$$;

-- Overload for 6-arg callers (backward compatible)
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
