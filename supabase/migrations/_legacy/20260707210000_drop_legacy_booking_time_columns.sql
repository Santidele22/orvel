-- Pre-MVP cleanup: starts_at/ends_at are the only canonical booking time fields.
-- If an environment still has legacy duplicate columns, preserve unambiguous data,
-- fail on drift, then remove the duplicate columns.

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

  INSERT INTO public.bookings (business_id, customer_id, service_id, starts_at, ends_at, status, manage_token, notes)
  VALUES (p_business_id, p_customer_id, coalesce(nullif(p_service_id, ''), 'manual'), p_start_time, p_end_time, 'booked', encode(extensions.gen_random_bytes(18), 'hex'), p_notes)
  RETURNING id INTO v_appointment_id;

  RETURN jsonb_build_object('appointment_id', v_appointment_id, 'status', 'booked', 'capacity', v_capacity, 'occupied', v_occupied + 1, 'remaining_capacity', greatest(v_capacity - (v_occupied + 1), 0));
END;
$$;

DO $$
DECLARE
  v_has_start_time boolean;
  v_has_end_time boolean;
  v_drift_count integer := 0;
  v_null_count integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'start_time'
  ) INTO v_has_start_time;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'end_time'
  ) INTO v_has_end_time;

  IF v_has_start_time <> v_has_end_time THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'bookings legacy time columns are partially present';
  END IF;

  IF v_has_start_time THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.bookings
      WHERE (starts_at IS NOT NULL AND start_time IS NOT NULL AND starts_at IS DISTINCT FROM start_time)
         OR (ends_at IS NOT NULL AND end_time IS NOT NULL AND ends_at IS DISTINCT FROM end_time)
    $sql$ INTO v_drift_count;

    IF v_drift_count > 0 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'bookings legacy time column drift detected';
    END IF;

    EXECUTE $sql$
      UPDATE public.bookings
      SET starts_at = COALESCE(starts_at, start_time),
          ends_at = COALESCE(ends_at, end_time)
      WHERE (starts_at IS NULL AND start_time IS NOT NULL)
         OR (ends_at IS NULL AND end_time IS NOT NULL)
    $sql$;
  END IF;

  SELECT count(*)
  FROM public.bookings
  WHERE starts_at IS NULL OR ends_at IS NULL
  INTO v_null_count;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'bookings canonical time columns cannot be null';
  END IF;
END;
$$;

ALTER TABLE public.bookings
  DROP COLUMN IF EXISTS start_time,
  DROP COLUMN IF EXISTS end_time;
