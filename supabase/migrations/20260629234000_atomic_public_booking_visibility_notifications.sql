-- Ensure public booking success is atomic with dashboard visibility and notifications.
-- Public bookings must receive a branch, create the bell notification, and queue
-- the confirmation email inside the same database transaction.

BEGIN;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.handle_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_name text;
  v_business_name text;
  v_service_name text;
  v_customer_email text;
  v_owner_email text;
  v_owner_id uuid;
BEGIN
  -- Public self-service bookings are handled atomically by create_public_booking.
  IF NEW.source = 'client-self-service' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, email INTO v_customer_name, v_customer_email FROM public.customers WHERE id::text = NEW.customer_id::text;
  SELECT name, owner_id INTO v_business_name, v_owner_id FROM public.businesses WHERE id::text = NEW.business_id::text;
  SELECT name INTO v_service_name FROM public.services WHERE id::text = NEW.service_id::text;
  IF v_owner_id IS NOT NULL THEN SELECT email INTO v_owner_email FROM auth.users WHERE id::text = v_owner_id::text; END IF;

  v_customer_name := COALESCE(v_customer_name, 'Cliente');
  v_business_name := COALESCE(v_business_name, 'Orvel');
  v_service_name := COALESCE(v_service_name, 'Servicio');

  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  VALUES (NEW.business_id, NEW.id, 'appointment.created', 'Nuevo turno', 'El cliente ' || v_customer_name || ' reservó ' || v_service_name || '.', jsonb_build_object('customer_name', v_customer_name))
  ON CONFLICT DO NOTHING;

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT NEW.business_id, NEW.id, v_customer_email, 'booking_created', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = NEW.id AND neo.template_key = 'booking_created'
    );
  END IF;

  IF v_owner_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT NEW.business_id, NEW.id, v_owner_email, 'booking_created_business', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = NEW.id AND neo.template_key = 'booking_created_business'
    );
  END IF;

  RETURN NEW;
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
  v_owner_id uuid;
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

  SELECT b.id, b.timezone, b.name, b.owner_id INTO v_business_id, v_timezone, v_business_name, v_owner_id
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
  FROM public._query_booking_slot_availability(
    v_business_id,
    v_service_id,
    v_availability_date,
    v_branch_id,
    NULL,
    NULL,
    true
  ) AS availability
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

  SELECT COALESCE(bs.support_email, au.email) INTO v_business_email
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  LEFT JOIN auth.users au ON au.id = b.owner_id
  WHERE b.id = v_business_id
  LIMIT 1;

  IF v_business_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT v_business_id, v_booking_id, v_business_email, 'appointment_created_business', jsonb_build_object(
      'booking_id', v_booking_id,
      'starts_at', v_starts_at,
      'customer_name', v_customer_name,
      'service_name', v_service_name
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = v_booking_id AND neo.template_key = 'appointment_created_business'
    );
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

WITH principal_branches AS (
  SELECT DISTINCT ON (br.business_id) br.business_id, br.id AS branch_id
  FROM public.branches br
  WHERE COALESCE(br.is_active, true) = true
  ORDER BY br.business_id, CASE WHEN br.slug = 'principal' THEN 0 ELSE 1 END, br.created_at ASC, br.id ASC
)
UPDATE public.bookings bk
SET branch_id = pb.branch_id
FROM principal_branches pb
WHERE bk.branch_id IS NULL
  AND bk.business_id = pb.business_id
  AND bk.source = 'client-self-service';

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
LEFT JOIN public.services s ON s.id::text = bk.service_id
WHERE bk.source = 'client-self-service'
  AND bk.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.dashboard_notifications dn WHERE dn.appointment_id = bk.id AND dn.event_type = 'appointment.created'
  );

GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
