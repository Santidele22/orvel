-- Business deposit percent: one seña setting for all services (0/25/50/100).
-- Does not edit applied migrations. services.deposit_percent remains unused for holds.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS deposit_percent smallint NOT NULL DEFAULT 0;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_deposit_percent_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_deposit_percent_check
  CHECK (deposit_percent in (0, 25, 50, 100));

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
      'auto_confirm', COALESCE(bs.auto_confirm, true),
      'deposit_enabled', COALESCE(bs.deposit_enabled, false),
      'deposit_percent', COALESCE(bs.deposit_percent, 0),
      'deposit_amount_pesos', bs.deposit_amount_pesos,
      'deposit_alias', bs.deposit_alias,
      'deposit_cbu', bs.deposit_cbu
    ) FROM public.business_settings bs WHERE bs.business_id = p_business_id),
    jsonb_build_object(
      'prep_buffer_minutes', 0,
      'post_buffer_minutes', 0,
      'min_notice_minutes', 0,
      'max_advance_days', 30,
      'auto_assign_professional', false,
      'buffer_minutes', 0,
      'auto_confirm', true,
      'deposit_enabled', false,
      'deposit_percent', 0,
      'deposit_amount_pesos', NULL,
      'deposit_alias', NULL,
      'deposit_cbu', NULL
    )
  );
$$;

CREATE OR REPLACE FUNCTION public._booking_deposit_hold_amount(
  p_price numeric,
  p_percent smallint
)
RETURNS numeric(10, 2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_percent, 0) = 0 THEN NULL
    ELSE ROUND((p_price * p_percent) / 100.0, 0)
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
  v_requested_professional text;
  v_allow_client_selection boolean := false;
  v_auto_assign boolean := false;
  v_assigned_professional_id uuid;
  v_assigned_professional_name text;
  v_eligible_count integer := 0;
  v_deposit_enabled boolean := false;
  v_service_price numeric(10, 2);
  v_deposit_percent smallint := 0;
  v_deposit_amount numeric(10, 2);
  v_deposit_alias text;
  v_deposit_cbu text;
  v_deposit_status text := 'none';
  v_deposit_code text;
  v_deposit_hold_expires_at timestamptz;
  v_payload jsonb;
  v_attempt integer := 0;
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
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

  SELECT s.duration_minutes, s.name, s.price
    INTO v_duration_minutes, v_service_name, v_service_price
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
  v_deposit_enabled := COALESCE((v_config->>'deposit_enabled')::boolean, false);
  v_deposit_percent := COALESCE((v_config->>'deposit_percent')::smallint, 0);
  v_deposit_alias := nullif(btrim(v_config->>'deposit_alias'), '');
  v_deposit_cbu := nullif(btrim(v_config->>'deposit_cbu'), '');
  IF v_deposit_enabled AND v_deposit_percent IN (25, 50, 100) THEN
    IF v_deposit_alias IS NULL AND v_deposit_cbu IS NULL THEN
      PERFORM public._raise_rpc('BOOKING_DEPOSIT_SETTINGS_INCOMPLETE');
    END IF;
    v_deposit_amount := public._booking_deposit_hold_amount(v_service_price, v_deposit_percent);
    v_deposit_status := 'pending';
    v_status := 'confirmed';
  END IF;

  IF v_starts_at < now() + make_interval(mins => v_min_notice) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_SOON');
  END IF;

  IF v_starts_at > now() + make_interval(days => v_max_advance) THEN
    PERFORM public._raise_rpc('BOOKING_TOO_FAR_ADVANCE');
  END IF;

  SELECT COALESCE(bs.allow_client_professional_selection, false),
         COALESCE(bs.auto_assign_professional, false)
    INTO v_allow_client_selection, v_auto_assign
  FROM public.business_settings bs
  WHERE bs.business_id = v_business_id;

  v_allow_client_selection := COALESCE(v_allow_client_selection, false);
  v_auto_assign := COALESCE(v_auto_assign, false);

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

  v_requested_professional := nullif(btrim(create_public_booking.professional_id), '');

  IF v_requested_professional IS NOT NULL THEN
    IF NOT v_allow_client_selection THEN
      PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
    END IF;

    BEGIN
      v_assigned_professional_id := v_requested_professional::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.professionals p
      INNER JOIN public.professional_services ps ON ps.professional_id = p.id
      WHERE p.id = v_assigned_professional_id
        AND p.business_id = v_business_id
        AND p.active = true
        AND p.deleted_at IS NULL
        AND ps.service_id = v_service_id
    ) THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;

    IF NOT public._professional_is_free(v_business_id, v_assigned_professional_id, v_starts_at, v_ends_at) THEN
      PERFORM public._raise_rpc('SLOT_CONFLICT');
    END IF;
  ELSE
    SELECT count(*)
      INTO v_eligible_count
    FROM public.professionals p
    INNER JOIN public.professional_services ps ON ps.professional_id = p.id
    WHERE p.business_id = v_business_id
      AND p.active = true
      AND p.deleted_at IS NULL
      AND ps.service_id = v_service_id;

    IF v_eligible_count >= 2 OR (v_eligible_count >= 1 AND v_auto_assign) THEN
      v_assigned_professional_id := public._pick_professional_for_slot(
        v_business_id,
        v_service_id,
        v_starts_at,
        v_ends_at,
        NULL
      );

      IF v_assigned_professional_id IS NULL THEN
        PERFORM public._raise_rpc('SLOT_CONFLICT');
      END IF;
    END IF;
  END IF;

  IF v_assigned_professional_id IS NOT NULL THEN
    SELECT p.name
      INTO v_assigned_professional_name
    FROM public.professionals p
    WHERE p.id = v_assigned_professional_id;
  END IF;

  INSERT INTO public.customers (business_id, full_name, email, phone)
  VALUES (v_business_id, v_customer_name, v_customer_email, v_customer_phone)
  RETURNING id INTO v_customer_id;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_deposit_status = 'pending' THEN
      v_deposit_code := public._generate_booking_deposit_code();
      v_deposit_hold_expires_at := public._booking_deposit_hold_expires_at(now());
    END IF;
    BEGIN
      INSERT INTO public.bookings (
        business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
        manage_token_hash, manage_token_expires_at, source, professional_id,
        deposit_status, deposit_hold_expires_at, deposit_code, deposit_amount_pesos
      ) VALUES (
        v_business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, v_status, NULLIF(btrim(notes), ''),
        public._hash_manage_token(v_management_bearer), v_ends_at + interval '1 hour', 'client-self-service',
        v_assigned_professional_id::text,
        v_deposit_status, v_deposit_hold_expires_at, v_deposit_code,
        CASE WHEN v_deposit_status = 'pending' THEN v_deposit_amount ELSE NULL END
      )
      RETURNING id INTO v_booking_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_deposit_status IS DISTINCT FROM 'pending' OR v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

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

  v_payload := jsonb_build_object(
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'status', v_status,
    'manage_token', v_management_bearer,
    'source', 'client-self-service',
    'db_atomic_visibility_notifications', true,
    'business_email_outbox_enqueued', v_business_email_outbox_enqueued,
    'professional_id', v_assigned_professional_id,
    'professional_name', v_assigned_professional_name
  );
  IF v_deposit_status = 'pending' THEN
    v_payload := v_payload || jsonb_build_object(
      'deposit_code', v_deposit_code,
      'deposit_amount', v_deposit_amount,
      'deposit_alias', v_deposit_alias,
      'deposit_cbu', v_deposit_cbu,
      'deposit_hold_expires_at', v_deposit_hold_expires_at,
      'deposit_hold_message', 'Si no se confirma la seña, el horario se libera.'
    );
  END IF;
  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_business_by_slug(business_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT b.id, b.slug, b.name, b.timezone,
         coalesce(bs.auto_confirm, true) AS auto_confirm,
         coalesce(bs.cancellation_window_minutes, 60) AS cancellation_window_minutes,
         coalesce(bs.allow_client_reschedule, true) AS allow_client_reschedule,
         coalesce(bs.allow_client_cancel, true) AS allow_client_cancel,
         coalesce(bs.allow_client_professional_selection, false) AS allow_client_professional_selection,
         coalesce(bs.slot_interval_minutes, 30) AS slot_interval_minutes,
         coalesce(bs.buffer_minutes, 0) AS buffer_minutes,
         coalesce(bs.min_notice_minutes, 0) AS min_notice_minutes,
         coalesce(bs.max_advance_days, 30) AS max_advance_days,
         coalesce(bs.working_hours, '{}'::jsonb) AS working_hours,
         coalesce(bs.deposit_enabled, false) AS deposit_enabled,
         coalesce(bs.deposit_percent, 0) AS deposit_percent
    INTO v_row
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.slug = resolve_business_by_slug.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(resolve_business_by_slug.business_slug)
  LIMIT 1;

  IF v_row.id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'timezone', v_row.timezone,
    'booking_policy', jsonb_build_object(
      'autoConfirm', v_row.auto_confirm,
      'cancellationWindowMinutes', v_row.cancellation_window_minutes,
      'allowClientProfessionalSelection', v_row.allow_client_professional_selection,
      'allowClientReschedule', v_row.allow_client_reschedule,
      'allowClientCancel', v_row.allow_client_cancel
    ),
    'settings', jsonb_build_object(
      'slotIntervalMinutes', v_row.slot_interval_minutes,
      'bufferMinutes', v_row.buffer_minutes,
      'minNoticeMinutes', v_row.min_notice_minutes,
      'maxAdvanceDays', v_row.max_advance_days,
      'workingHours', v_row.working_hours,
      'depositEnabled', v_row.deposit_enabled,
      'depositPercent', v_row.deposit_percent
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_business_by_slug(text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
