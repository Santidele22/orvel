-- Pre-MVP business schema cleanup.
-- businesses owns identity/public routing; business_settings owns operational configuration.

BEGIN;

-- Guard identity ownership before dropping duplicated columns. businesses owns identity;
-- business_settings identity drift must be resolved explicitly instead of silently
-- overwriting public routing/name data from settings.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_settings' AND column_name = 'slug'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.businesses b
      JOIN public.business_settings bs ON bs.business_id = b.id
      WHERE NULLIF(btrim(bs.slug), '') IS NOT NULL
        AND b.slug IS DISTINCT FROM bs.slug
    ) THEN
      RAISE EXCEPTION 'business_settings.slug drift detected; resolve before schema cleanup' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_settings' AND column_name = 'business_name'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.businesses b
      JOIN public.business_settings bs ON bs.business_id = b.id
      WHERE NULLIF(btrim(bs.business_name), '') IS NOT NULL
        AND b.name IS DISTINCT FROM bs.business_name
    ) THEN
      RAISE EXCEPTION 'business_settings.business_name drift detected; resolve before schema cleanup' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'business_settings' AND column_name = 'timezone'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.businesses b
      JOIN public.business_settings bs ON bs.business_id = b.id
      WHERE NULLIF(btrim(bs.timezone), '') IS NOT NULL
        AND b.timezone IS DISTINCT FROM bs.timezone
    ) THEN
      RAISE EXCEPTION 'business_settings.timezone drift detected; resolve before schema cleanup' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'capacity'
  ) THEN
    UPDATE public.business_settings bs
    SET capacity = GREATEST(COALESCE(b.capacity, bs.capacity, 1), 1),
        updated_at = now()
    FROM public.businesses b
    WHERE b.id = bs.business_id
      AND b.capacity IS NOT NULL
      AND bs.capacity IS DISTINCT FROM GREATEST(COALESCE(b.capacity, bs.capacity, 1), 1);
  END IF;
END $$;

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
    AND bk.status = 'confirmed'
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

-- Stop syncing identity into business_settings before those columns disappear.
DROP TRIGGER IF EXISTS tr_sync_from_settings ON public.business_settings;
DROP TRIGGER IF EXISTS trigger_sync_business_slug ON public.businesses;
DROP FUNCTION IF EXISTS public.sync_business_slug();

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
         COALESCE(bs.working_hours, '{}'::jsonb)
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
          AND bk.status = 'confirmed'
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

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_business_id uuid,
  p_service_id uuid,
  p_customer_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_branch_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requester uuid := auth.uid();
  v_capacity integer;
  v_occupied integer;
  v_booking_id uuid;
  v_bucket timestamptz;
BEGIN
  IF p_business_id IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; END IF;
  IF p_start_time IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; END IF;
  IF p_end_time IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'BOOKING_VALIDATION_ERROR'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'UNAUTHORIZED'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = v_requester
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'UNAUTHORIZED';
  END IF;

  FOR v_bucket IN
    SELECT generate_series(p_start_time, p_end_time - interval '1 millisecond', interval '30 minutes')
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':slot:' || v_bucket::text, 0));
  END LOOP;

  SELECT GREATEST(COALESCE(bs.capacity, 1), 1) INTO v_capacity
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = p_business_id
  FOR UPDATE OF b;

  SELECT count(*) INTO v_occupied
  FROM public.bookings existing
  WHERE existing.business_id = p_business_id
    AND (p_branch_id IS NULL OR existing.branch_id = p_branch_id)
    AND existing.status = 'booked'
    AND tstzrange(existing.starts_at, existing.ends_at, '[)') && tstzrange(p_start_time, p_end_time, '[)');

  IF NOT EXISTS (SELECT 1 WHERE v_capacity > v_occupied) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'SLOT_CONFLICT';
  END IF;

  INSERT INTO public.bookings (business_id, branch_id, service_id, customer_id, starts_at, ends_at, status, notes)
  VALUES (p_business_id, p_branch_id, p_service_id, p_customer_id, p_start_time, p_end_time, 'booked', p_notes)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'booked', 'remaining_capacity', v_capacity - v_occupied - 1);
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

  SELECT GREATEST(COALESCE(bs.capacity, 1), 1), COALESCE(b.owner_id = v_requester, false)
  INTO v_capacity, v_is_owner
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.id = p_business_id
  FOR UPDATE OF b;

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

CREATE OR REPLACE FUNCTION public.complete_signup_onboarding(
  p_business_name text,
  p_business_type text,
  p_plan_code text DEFAULT 'FREE',
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_business_id uuid;
  v_business_name text := NULLIF(btrim(COALESCE(p_business_name, '')), '');
  v_business_type text := NULLIF(lower(btrim(COALESCE(p_business_type, ''))), '');
  v_catalog_business_type text;
  v_default_services_count integer := 0;
  v_plan_code text := 'FREE';
  v_slug_base text;
  v_slug text;
  v_slug_attempts integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'complete_signup_onboarding requires an authenticated user' USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role' AND v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'complete_signup_onboarding cannot write another user onboarding state' USING ERRCODE = '42501';
  END IF;

  IF v_business_type IS NULL THEN
    RAISE EXCEPTION 'business_type is required to complete onboarding' USING ERRCODE = '22023';
  END IF;

  v_business_name := COALESCE(v_business_name, 'Mi Negocio');

  IF char_length(v_business_name) > 120 THEN
    RAISE EXCEPTION 'business_name is too long to complete onboarding' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_business_type) > 64 THEN
    RAISE EXCEPTION 'business_type is too long to complete onboarding' USING ERRCODE = '22023';
  END IF;

  SELECT bt.code INTO v_catalog_business_type
  FROM public.business_types bt
  LEFT JOIN public.business_type_aliases bta ON bta.business_type_code = bt.code
  WHERE bt.is_active = true
    AND (bt.code = v_business_type OR bta.alias = v_business_type)
  ORDER BY CASE WHEN bt.code = v_business_type THEN 0 ELSE 1 END, bt.sort_order ASC, bt.code ASC
  LIMIT 1;

  IF v_catalog_business_type IS NULL THEN
    RAISE EXCEPTION 'business_type is not available in the active catalog' USING ERRCODE = '22023';
  END IF;

  v_business_type := v_catalog_business_type;
  v_slug_base := COALESCE(NULLIF(public.canonical_booking_slug(v_business_name), ''), 'mi-negocio');

  SELECT psi.business_id INTO v_business_id
  FROM public.pending_signup_intents psi
  WHERE psi.user_id = v_user_id
    AND psi.status = 'materialized'
    AND psi.business_id IS NOT NULL
  ORDER BY psi.materialized_at DESC NULLS LAST, psi.updated_at DESC
  LIMIT 1;

  IF v_business_id IS NULL THEN
    SELECT b.id INTO v_business_id
    FROM public.businesses b
    WHERE b.owner_id = v_user_id
    ORDER BY b.created_at ASC
    LIMIT 1;
  END IF;

  IF v_business_id IS NULL THEN
    v_business_id := v_user_id;
  END IF;

  LOOP
    v_slug_attempts := v_slug_attempts + 1;
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    BEGIN
      INSERT INTO public.businesses(id, slug, name, timezone, owner_id)
      VALUES (v_business_id, v_slug, v_business_name, 'America/Argentina/Buenos_Aires', v_user_id)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        timezone = EXCLUDED.timezone,
        owner_id = EXCLUDED.owner_id;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_slug_attempts >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  INSERT INTO public.business_settings(
    business_id,
    plan,
    business_type,
    capacity,
    buffer_minutes,
    min_notice_minutes,
    slot_interval_minutes,
    updated_at
  )
  VALUES (v_business_id, lower(v_plan_code), v_business_type, 1, 15, 120, 30, now())
  ON CONFLICT (business_id) DO UPDATE SET
    plan = EXCLUDED.plan,
    business_type = EXCLUDED.business_type,
    capacity = GREATEST(COALESCE(public.business_settings.capacity, 1), 1),
    buffer_minutes = EXCLUDED.buffer_minutes,
    min_notice_minutes = EXCLUDED.min_notice_minutes,
    slot_interval_minutes = EXCLUDED.slot_interval_minutes,
    updated_at = now();

  INSERT INTO public.business_onboarding_state(
    business_id,
    current_step,
    selected_plan_code,
    account_user_id,
    business_type,
    dashboard_ready_at,
    updated_at
  )
  VALUES (v_business_id, 'dashboard_ready', v_plan_code, v_user_id, v_business_type, now(), now())
  ON CONFLICT (business_id) DO UPDATE SET
    current_step = 'dashboard_ready',
    selected_plan_code = EXCLUDED.selected_plan_code,
    account_user_id = EXCLUDED.account_user_id,
    business_type = EXCLUDED.business_type,
    dashboard_ready_at = now(),
    updated_at = now();

  SELECT public.provision_default_services_for_business(v_business_id, ARRAY[v_business_type])
    INTO v_default_services_count;

  INSERT INTO public.onboarding_events(business_id, step, metadata)
  VALUES (
    v_business_id,
    'dashboard_ready',
    jsonb_build_object('plan', v_plan_code, 'business_type', v_business_type, 'default_services_provisioned', v_default_services_count)
  )
  ON CONFLICT (business_id, step) DO NOTHING;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'onboardingCompleted', true,
    'onboarding_completed', true,
    'onboarding_required', false,
    'plan', v_plan_code,
    'tipoNegocio', v_business_type,
    'businessType', v_business_type,
    'business_type', v_business_type,
    'business_id', v_business_id,
    'business_name', v_business_name,
    'booking_slug', v_slug
  ),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'orvel_onboarding_completed', true,
    'orvel_dashboard_ready', true,
    'orvel_plan', v_plan_code,
    'orvel_business_type', v_business_type,
    'orvel_business_id', v_business_id,
    'orvel_business_name', v_business_name,
    'orvel_booking_slug', v_slug
  ),
  updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'business_id', v_business_id,
    'business_name', v_business_name,
    'booking_slug', v_slug,
    'slug', v_slug,
    'plan', v_plan_code,
    'business_type', v_business_type,
    'default_services_provisioned', v_default_services_count,
    'dashboard_ready', true
  );
END;
$$;

ALTER TABLE public.business_settings
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS business_name,
  DROP COLUMN IF EXISTS timezone;

ALTER TABLE public.businesses
  DROP COLUMN IF EXISTS capacity;

COMMIT;
NOTIFY pgrst, 'reload schema';
