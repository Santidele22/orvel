-- Manual booking deposits (WU1): orthogonal deposit_status on legacy public.bookings,
-- occupancy excludes released holds, and lazy expiry via release_expired_booking_hold.
-- Does not redefine create_public_booking.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deposit_hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_code text,
  ADD COLUMN IF NOT EXISTS deposit_amount_pesos numeric(10, 2),
  ADD COLUMN IF NOT EXISTS deposit_claimed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname = 'bookings_deposit_status_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_deposit_status_check
      CHECK (deposit_status IN ('none', 'pending', 'paid', 'claim_pending', 'released', 'abandoned', 'void'));
  END IF;
END $$;

CREATE UNIQUE INDEX bookings_deposit_code_uidx
  ON public.bookings (deposit_code)
  WHERE deposit_code IS NOT NULL;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS deposit_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_amount_pesos numeric(10, 2),
  ADD COLUMN IF NOT EXISTS deposit_alias text,
  ADD COLUMN IF NOT EXISTS deposit_cbu text;

CREATE TABLE public.booking_deposit_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.booking_deposit_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_deposit_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_deposit_strikes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.booking_deposit_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.booking_deposit_evidence FROM anon, authenticated;
REVOKE ALL ON TABLE public.booking_deposit_strikes FROM PUBLIC;
REVOKE ALL ON TABLE public.booking_deposit_strikes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._booking_deposit_hold_expires_at(p_created_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_created_at + interval '30 minutes';
$$;

REVOKE ALL ON FUNCTION public._booking_deposit_hold_expires_at(timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.release_expired_booking_hold(
  p_booking_id uuid DEFAULT NULL,
  p_business_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_updated integer;
BEGIN
  FOR r IN
    SELECT bk.id, bk.business_id, bk.customer_id, bk.deposit_status
    FROM public.bookings bk
    WHERE bk.deposit_status IN ('pending', 'claim_pending')
      AND bk.deposit_hold_expires_at < now()
      AND (p_booking_id IS NULL OR bk.id = p_booking_id)
      AND (p_business_id IS NULL OR bk.business_id = p_business_id)
    FOR UPDATE
  LOOP
    UPDATE public.bookings
    SET deposit_status = 'released',
        updated_at = now()
    WHERE id = r.id
      AND deposit_status IN ('pending', 'claim_pending');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      CONTINUE;
    END IF;

    IF r.deposit_status = 'pending' THEN
      CONTINUE;
    END IF;

    IF r.deposit_status = 'claim_pending' THEN
      INSERT INTO public.booking_deposit_strikes (business_id, customer_id, booking_id)
      VALUES (r.business_id, r.customer_id, r.id)
      ON CONFLICT (booking_id) DO NOTHING;

      INSERT INTO public.booking_deposit_evidence (
        booking_id,
        business_id,
        event_type,
        note,
        performed_by
      ) VALUES (
        r.id,
        r.business_id,
        'timeout_strike',
        NULL,
        NULL
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_booking_hold(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_booking_hold(uuid, uuid) TO anon, authenticated, service_role;

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
    AND COALESCE(bk.deposit_status, 'none') NOT IN ('released', 'abandoned', 'void')
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
  v_windows jsonb;
  v_window_count integer;
  v_window_idx integer;
  v_using_intervals boolean;
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

  PERFORM public.release_expired_booking_hold(NULL, p_business_id);

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

  IF v_day_settings IS NULL OR NOT COALESCE((v_day_settings->>'enabled')::boolean, false) THEN
    RETURN;
  END IF;

  v_using_intervals := jsonb_typeof(v_day_settings->'intervals') = 'array'
    AND jsonb_array_length(v_day_settings->'intervals') > 0;

  IF v_using_intervals THEN
    v_windows := v_day_settings->'intervals';
    v_window_count := LEAST(jsonb_array_length(v_windows), 2);
  ELSE
    IF COALESCE(v_day_settings->>'start', '') = '' AND COALESCE(v_day_settings->>'end', '') = '' THEN
      RETURN;
    END IF;

    v_windows := jsonb_build_array(jsonb_build_object(
      'start', v_day_settings->>'start',
      'end', v_day_settings->>'end'
    ));
    v_window_count := 1;
  END IF;

  FOR v_window_idx IN 0 .. (v_window_count - 1) LOOP
    BEGIN
      v_start_time := ((v_windows->v_window_idx)->>'start')::time;
      v_end_time := ((v_windows->v_window_idx)->>'end')::time;
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END;

    IF v_start_time IS NULL OR v_end_time IS NULL THEN
      IF v_using_intervals THEN
        CONTINUE;
      END IF;
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;

    IF v_end_time <= v_start_time THEN
      IF v_using_intervals THEN
        CONTINUE;
      END IF;
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
            AND COALESCE(bk.deposit_status, 'none') NOT IN ('released', 'abandoned', 'void')
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
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._query_booking_slot_availability(uuid, uuid, text, uuid, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
