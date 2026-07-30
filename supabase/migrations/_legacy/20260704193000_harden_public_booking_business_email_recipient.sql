-- Harden public booking business-owner email recipient resolution.
-- Forward-only: keep applied migrations immutable and redefine only affected helpers/RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public._resolve_booking_business_email(p_business_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT NULLIF(btrim(bs.support_email), '')
  INTO v_email
  FROM public.business_settings bs
  WHERE bs.business_id = p_business_id;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  SELECT NULLIF(btrim(u.email), '')
  INTO v_email
  FROM public.businesses b
  JOIN auth.users u ON u.id = b.owner_id
  WHERE b.id = p_business_id
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  SELECT NULLIF(btrim(u.email), '')
  INTO v_email
  FROM public.business_members bm
  JOIN auth.users u ON u.id = bm.user_id
  WHERE bm.business_id = p_business_id
    AND lower(COALESCE(bm.role, '')) = 'owner'
  ORDER BY bm.user_id
  LIMIT 1;

  IF v_email IS NULL THEN
    RAISE LOG 'Orvel booking business email recipient missing for business %', p_business_id;
  END IF;

  RETURN v_email;
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_booking_lifecycle_email(
  p_booking public.bookings,
  p_recipient_role text,
  p_template_key text,
  p_to_email text,
  p_event_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_to_email text := NULLIF(btrim(p_to_email), '');
BEGIN
  IF p_booking.id IS NULL OR p_template_key IS NULL OR p_event_key IS NULL THEN
    RAISE LOG 'Orvel booking lifecycle email skipped: invalid input template %, event %, booking %', p_template_key, p_event_key, p_booking.id;
    RETURN;
  END IF;

  IF v_to_email IS NULL THEN
    RAISE LOG 'Orvel booking lifecycle email skipped: missing recipient for template %, event %, booking %, business %', p_template_key, p_event_key, p_booking.id, p_booking.business_id;
    RETURN;
  END IF;

  INSERT INTO public.notification_email_outbox (
    business_id,
    booking_id,
    to_email,
    template_key,
    payload,
    lifecycle_event_key
  )
  VALUES (
    p_booking.business_id,
    p_booking.id,
    v_to_email,
    p_template_key,
    COALESCE(public._booking_lifecycle_email_payload(p_booking), '{}'::jsonb)
      || jsonb_build_object('recipient_role', p_recipient_role, 'lifecycle_event_key', p_event_key),
    p_event_key
  )
  ON CONFLICT (lifecycle_event_key) WHERE lifecycle_event_key IS NOT NULL DO NOTHING;
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
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL OR client IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF professional_id IS NOT NULL AND btrim(professional_id) <> '' THEN
    PERFORM public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  END IF;

  SELECT b.id, b.timezone, b.name INTO v_business_id, v_timezone, v_business_name
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

  IF v_branch_id IS NULL THEN
    SELECT br.id INTO v_branch_id
    FROM public.branches br
    WHERE br.business_id = v_business_id
      AND COALESCE(br.is_active, true) = true
    ORDER BY CASE WHEN br.slug = 'principal' THEN 0 ELSE 1 END, br.created_at ASC, br.id ASC
    LIMIT 1;

    IF v_branch_id IS NULL THEN
      PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
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

  SELECT count(*) INTO v_matching_slot_count
  FROM public._query_booking_slot_availability(v_business_id, v_service_id, v_availability_date, v_branch_id, NULL, NULL, true) AS availability
  WHERE availability.starts_at_iso::timestamptz = v_starts_at
    AND availability.remaining_capacity > 0;

  IF v_matching_slot_count < 1 THEN
    PERFORM public._raise_rpc('SLOT_CONFLICT');
  END IF;

  PERFORM public._lock_booking_conflict_window(v_business_id, v_branch_id, v_starts_at, v_ends_at);
  PERFORM public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

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

  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  SELECT v_business_id, v_booking_id, 'appointment.created', 'Nuevo turno', 'El cliente ' || v_customer_name || ' reservó ' || COALESCE(v_service_name, 'Servicio') || '.', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', v_starts_at)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dashboard_notifications dn WHERE dn.appointment_id = v_booking_id AND dn.event_type = 'appointment.created'
  );

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

  v_business_email := public._resolve_booking_business_email(v_business_id);

  IF v_business_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT v_business_id, v_booking_id, v_business_email, 'appointment_created_business', jsonb_build_object(
      'booking_id', v_booking_id,
      'starts_at', v_starts_at,
      'customer_name', v_customer_name,
      'service_name', v_service_name,
      'business_name', COALESCE(v_business_name, 'Orvel')
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = v_booking_id AND neo.template_key = 'appointment_created_business'
    );
  ELSE
    RAISE LOG 'Orvel public booking business email skipped: missing recipient for booking %, business %', v_booking_id, v_business_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'status', 'confirmed',
    'manage_token', v_management_bearer,
    'source', 'client-self-service',
    'db_atomic_visibility_notifications', true
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

REVOKE ALL ON FUNCTION public._resolve_booking_business_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._enqueue_booking_lifecycle_email(public.bookings, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
