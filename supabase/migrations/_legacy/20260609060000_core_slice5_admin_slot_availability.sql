-- Core Slice 5 admin availability RPC.
-- Forward-only remediation: Supabase owns admin productive availability and
-- collision/capacity semantics; dashboard callers must not compute slots from
-- frontend windows, raw bookings, or blocked_times reads.

BEGIN;

ALTER TABLE public.blocked_times
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS blocked_times_business_branch_starts_idx
  ON public.blocked_times (business_id, branch_id, starts_at);

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
         COALESCE(bs.capacity, b.capacity, 1),
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

CREATE OR REPLACE FUNCTION public.query_admin_slot_availability(
  business_id uuid,
  service_id uuid,
  date_iso text,
  branch_id uuid DEFAULT NULL,
  context text DEFAULT 'admin-create',
  booking_id uuid DEFAULT NULL,
  duration_minutes integer DEFAULT NULL
)
RETURNS TABLE (starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context text := COALESCE(NULLIF(btrim(query_admin_slot_availability.context), ''), 'admin-create');
BEGIN
  IF query_admin_slot_availability.business_id IS NULL
     OR query_admin_slot_availability.service_id IS NULL
     OR nullif(btrim(query_admin_slot_availability.date_iso), '') IS NULL
     OR (query_admin_slot_availability.duration_minutes IS NOT NULL AND query_admin_slot_availability.duration_minutes <= 0) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF v_context NOT IN ('admin-create', 'admin-update', 'admin-reschedule') THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = query_admin_slot_availability.business_id) THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(query_admin_slot_availability.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  IF query_admin_slot_availability.booking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.id = query_admin_slot_availability.booking_id
      AND bk.business_id = query_admin_slot_availability.business_id
  ) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  RETURN QUERY
  SELECT helper.starts_at_iso, helper.ends_at_iso, helper.remaining_capacity
  FROM public._query_booking_slot_availability(
    query_admin_slot_availability.business_id,
    query_admin_slot_availability.service_id,
    query_admin_slot_availability.date_iso,
    query_admin_slot_availability.branch_id,
    query_admin_slot_availability.duration_minutes,
    query_admin_slot_availability.booking_id,
    true
  ) AS helper;
END;
$$;

REVOKE ALL ON FUNCTION public._query_booking_slot_availability(uuid, uuid, text, uuid, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.query_admin_slot_availability(uuid, uuid, text, uuid, text, uuid, integer) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
