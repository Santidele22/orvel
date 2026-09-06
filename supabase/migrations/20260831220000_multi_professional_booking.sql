-- Multi-professional booking: owner Equipo, optional public picker, auto-assign.
-- QA/prod may have 20260729 marked applied without professionals tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  name text NOT NULL,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_professionals_business
  ON public.professionals (business_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.professional_services (
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  service_id uuid NOT NULL REFERENCES public.services(id),
  custom_price numeric(12,2) CHECK (custom_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, service_id)
);

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business managers manage professionals" ON public.professionals;
DROP POLICY IF EXISTS "Business managers manage professional services" ON public.professional_services;

CREATE POLICY "Business managers manage professionals"
  ON public.professionals
  FOR ALL
  TO authenticated
  USING (public.can_manage_business(business_id))
  WITH CHECK (public.can_manage_business(business_id));

CREATE POLICY "Business managers manage professional services"
  ON public.professional_services
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_id
        AND public.can_manage_business(p.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_id
        AND public.can_manage_business(p.business_id)
    )
  );

CREATE OR REPLACE FUNCTION public._professional_is_free(
  p_business_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.business_id = p_business_id
      AND bk.professional_id = p_professional_id::text
      AND (p_exclude_booking_id IS NULL OR bk.id <> p_exclude_booking_id)
      AND bk.status IN ('confirmed', 'pending')
      AND tstzrange(bk.starts_at, bk.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;

CREATE OR REPLACE FUNCTION public._pick_professional_for_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id
  FROM public.professionals p
  INNER JOIN public.professional_services ps ON ps.professional_id = p.id
  WHERE p.business_id = p_business_id
    AND p.active = true
    AND p.deleted_at IS NULL
    AND ps.service_id = p_service_id
    AND public._professional_is_free(
      p_business_id,
      p.id,
      p_starts_at,
      p_ends_at,
      p_exclude_booking_id
    )
  ORDER BY
    (
      SELECT count(*)
      FROM public.bookings bk
      WHERE bk.business_id = p_business_id
        AND bk.professional_id = p.id::text
        AND bk.status IN ('confirmed', 'pending')
        AND (bk.starts_at AT TIME ZONE 'UTC')::date = (p_starts_at AT TIME ZONE 'UTC')::date
    ) ASC,
    p.name ASC,
    p.id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._professional_is_free(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._pick_professional_for_slot(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;

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

  INSERT INTO public.bookings (
    business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source, professional_id
  ) VALUES (
    v_business_id, v_branch_id, v_customer_id, v_service_id, v_starts_at, v_ends_at, v_status, NULLIF(btrim(notes), ''),
    public._hash_manage_token(v_management_bearer), v_ends_at + interval '1 hour', 'client-self-service',
    v_assigned_professional_id::text
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
    'business_email_outbox_enqueued', v_business_email_outbox_enqueued,
    'professional_id', v_assigned_professional_id,
    'professional_name', v_assigned_professional_name
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

CREATE OR REPLACE FUNCTION public.query_public_slot_availability(
  business_slug text,
  service_id text,
  date_iso text,
  professional_id text
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
  v_professional_id uuid;
BEGIN
  IF nullif(btrim(professional_id), '') IS NULL THEN
    RETURN QUERY
    SELECT q.starts_at_iso, q.ends_at_iso, q.remaining_capacity
    FROM public.query_public_slot_availability(
      query_public_slot_availability.business_slug,
      query_public_slot_availability.service_id,
      query_public_slot_availability.date_iso
    ) AS q;
    RETURN;
  END IF;

  BEGIN
    v_service_id := service_id::uuid;
    v_professional_id := btrim(professional_id)::uuid;
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
    FROM public.professionals p
    INNER JOIN public.professional_services ps ON ps.professional_id = p.id
    WHERE p.id = v_professional_id
      AND p.business_id = v_business_id
      AND p.active = true
      AND p.deleted_at IS NULL
      AND ps.service_id = v_service_id
  ) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  RETURN QUERY
  SELECT q.starts_at_iso, q.ends_at_iso, 1
  FROM public.query_public_slot_availability(
    query_public_slot_availability.business_slug,
    query_public_slot_availability.service_id,
    query_public_slot_availability.date_iso
  ) AS q
  WHERE public._professional_is_free(
    v_business_id,
    v_professional_id,
    q.starts_at_iso::timestamptz,
    q.ends_at_iso::timestamptz
  );
END;
$$;

REVOKE ALL ON FUNCTION public.query_public_slot_availability(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.query_public_slot_availability(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_professionals_for_service(
  business_slug text,
  service_id text
)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_allow_selection boolean := false;
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(service_id), '') IS NULL THEN
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
  WHERE b.slug = list_public_professionals_for_service.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(list_public_professionals_for_service.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  SELECT COALESCE(bs.allow_client_professional_selection, false)
    INTO v_allow_selection
  FROM public.business_settings bs
  WHERE bs.business_id = v_business_id;

  IF NOT COALESCE(v_allow_selection, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.name
  FROM public.professionals p
  INNER JOIN public.professional_services ps ON ps.professional_id = p.id
  WHERE p.business_id = v_business_id
    AND p.active = true
    AND p.deleted_at IS NULL
    AND ps.service_id = v_service_id
  ORDER BY p.name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_professionals_for_service(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_professionals_for_service(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_business_professionals(p_business_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  phone text,
  email text,
  active boolean,
  service_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_business_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT public.can_manage_business(p_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.phone,
    p.email,
    p.active,
    COALESCE(
      (
        SELECT array_agg(ps.service_id ORDER BY ps.service_id)
        FROM public.professional_services ps
        WHERE ps.professional_id = p.id
      ),
      '{}'::uuid[]
    )
  FROM public.professionals p
  WHERE p.business_id = p_business_id
    AND p.deleted_at IS NULL
  ORDER BY p.name ASC, p.id ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_business_professional(
  p_business_id uuid,
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_active boolean DEFAULT true,
  p_service_ids uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  IF p_business_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT public.can_manage_business(p_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_service_ids, '{}'::uuid[])) AS sid
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = sid
        AND s.business_id = p_business_id
    )
  ) THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.professionals (business_id, name, phone, email, active, created_by, updated_by)
    VALUES (
      p_business_id,
      v_name,
      nullif(btrim(p_phone), ''),
      nullif(btrim(p_email), ''),
      COALESCE(p_active, true),
      auth.uid(),
      auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.professionals p
    SET
      name = v_name,
      phone = nullif(btrim(p_phone), ''),
      email = nullif(btrim(p_email), ''),
      active = COALESCE(p_active, p.active),
      updated_by = auth.uid(),
      updated_at = now()
    WHERE p.id = p_id
      AND p.business_id = p_business_id
      AND p.deleted_at IS NULL
    RETURNING p.id INTO v_id;

    IF v_id IS NULL THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;
  END IF;

  DELETE FROM public.professional_services ps
  WHERE ps.professional_id = v_id;

  INSERT INTO public.professional_services (professional_id, service_id)
  SELECT v_id, sid
  FROM unnest(COALESCE(p_service_ids, '{}'::uuid[])) AS sid
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_professionals(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_business_professional(uuid, uuid, text, text, text, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_professionals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_business_professional(uuid, uuid, text, text, text, boolean, uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.list_admin_bookings(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.list_admin_bookings(
  p_branch_id uuid,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  branch_id uuid,
  service_id text,
  customer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  notes text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  professional_id text,
  professional_name text
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
    AND br.is_active IS TRUE
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
    bk.service_id::text,
    bk.customer_id,
    bk.starts_at,
    bk.ends_at,
    bk.status,
    bk.notes,
    bk.source,
    bk.created_at,
    bk.updated_at,
    bk.professional_id,
    p.name
  FROM public.bookings bk
  LEFT JOIN public.professionals p
    ON p.id::text = bk.professional_id
   AND p.business_id = bk.business_id
  WHERE bk.business_id = v_business_id
    AND bk.branch_id = p_branch_id
    AND (p_starts_at IS NULL OR bk.ends_at > p_starts_at)
    AND (p_ends_at IS NULL OR bk.starts_at < p_ends_at)
  ORDER BY bk.starts_at ASC, bk.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) IS '@orvel-contract admin_booking_list';

REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
