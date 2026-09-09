-- Slice 2: onboarding once-flags, clock RPC branches 5–8, copy-link RPC.
-- Keeps ops branches 1–4. Does not insert retention types.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS booking_link_copied_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_no_services_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_no_hours_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_copy_link_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_share_day7_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.enqueue_operator_lifecycle_pushes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_count integer := 0;
  v_tz text;
  v_local_ts timestamp;
  v_local_date date;
  v_local_time time;
  v_day_n integer;
  v_remaining_today integer;
  v_yesterday_started integer;
  v_first_id uuid;
  v_first_starts timestamptz;
  v_first_name text;
  v_claim record;
  v_active_services integer;
  v_hours_all_closed boolean;
  v_has_enabled_interval boolean;
  v_public_count integer;
BEGIN
  FOR r IN
    SELECT
      businesses.id,
      businesses.account_closed_at,
      businesses.created_at,
      businesses.slug,
      COALESCE(businesses.timezone, 'America/Argentina/Buenos_Aires') AS tz,
      bs.working_hours,
      bs.booking_link_copied_at,
      bs.onboarding_no_services_notified_at,
      bs.onboarding_no_hours_notified_at,
      bs.onboarding_copy_link_notified_at,
      bs.onboarding_share_day7_notified_at
    FROM public.businesses
    LEFT JOIN public.business_settings bs ON bs.business_id = businesses.id
  LOOP
    IF r.account_closed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_tz := r.tz;
    v_local_ts := timezone(v_tz, now());
    v_local_date := v_local_ts::date;
    v_local_time := v_local_ts::time;
    v_day_n := (v_local_date - timezone(v_tz, r.created_at)::date) + 1;

    SELECT count(*)::integer
    INTO v_remaining_today
    FROM public.bookings bk
    WHERE bk.business_id = r.id
      AND bk.status IN ('booked', 'confirmed')
      AND bk.starts_at > now()
      AND timezone(v_tz, bk.starts_at)::date = v_local_date;

    IF EXTRACT(ISODOW FROM v_local_ts)::integer BETWEEN 1 AND 5
       AND v_local_time >= TIME '08:30'
       AND v_local_time < TIME '08:45' THEN
      IF public._insert_operator_lifecycle_notification(
        p_business_id := r.id,
        p_appointment_id := NULL,
        p_event_type := 'lifecycle.briefing',
        p_title := 'Resumen de hoy',
        p_body := format('Hoy tenés %s turnos.', v_remaining_today),
        p_idempotency_key := to_char(v_local_date, 'YYYY-MM-DD')
      ) THEN
        v_count := v_count + 1;
      END IF;
    END IF;

    SELECT bk.id, bk.starts_at, coalesce(c.full_name, 'Cliente')
    INTO v_first_id, v_first_starts, v_first_name
    FROM public.bookings bk
    LEFT JOIN public.customers c ON c.id = bk.customer_id
    WHERE bk.business_id = r.id
      AND bk.status IN ('booked', 'confirmed')
      AND bk.starts_at > now()
      AND timezone(v_tz, bk.starts_at)::date = v_local_date
    ORDER BY bk.starts_at ASC
    LIMIT 1;

    IF v_first_id IS NOT NULL
       AND v_first_starts >= now() + interval '60 minutes'
       AND v_first_starts <= now() + interval '90 minutes' THEN
      IF public._insert_operator_lifecycle_notification(
        p_business_id := r.id,
        p_appointment_id := v_first_id,
        p_event_type := 'lifecycle.first_turno_soon',
        p_title := 'Primer turno cerca',
        p_body := format(
          '%s a las %s.',
          v_first_name,
          to_char(timezone(v_tz, v_first_starts), 'HH24:MI')
        ),
        p_idempotency_key := to_char(v_local_date, 'YYYY-MM-DD')
      ) THEN
        v_count := v_count + 1;
      END IF;
    END IF;

    SELECT count(*)::integer
    INTO v_yesterday_started
    FROM public.bookings bk
    WHERE bk.business_id = r.id
      AND timezone(v_tz, bk.starts_at)::date = v_local_date - 1;

    IF v_remaining_today = 0 AND v_yesterday_started >= 1 THEN
      IF public._insert_operator_lifecycle_notification(
        p_business_id := r.id,
        p_appointment_id := NULL,
        p_event_type := 'lifecycle.empty_agenda',
        p_title := 'Agenda vacía',
        p_body := 'Hoy no quedan turnos. Ayer tuviste movimiento.',
        p_idempotency_key := to_char(v_local_date, 'YYYY-MM-DD')
      ) THEN
        v_count := v_count + 1;
      END IF;
    END IF;

    FOR v_claim IN
      SELECT bk.id
      FROM public.bookings bk
      WHERE bk.business_id = r.id
        AND bk.deposit_status = 'claim_pending'
        AND bk.deposit_claimed_at IS NOT NULL
        AND now() >= bk.deposit_claimed_at + interval '15 minutes'
    LOOP
      IF public._insert_operator_lifecycle_notification(
        p_business_id := r.id,
        p_appointment_id := v_claim.id,
        p_event_type := 'lifecycle.stale_deposit_claim',
        p_title := 'Seña sin confirmar',
        p_body := 'Sigue pendiente de confirmar 15 minutos después del aviso.',
        p_idempotency_key := 'booking:' || v_claim.id::text
      ) THEN
        v_count := v_count + 1;
      END IF;
    END LOOP;

    IF v_day_n >= 1 AND r.onboarding_no_services_notified_at IS NULL THEN
      SELECT count(*)::integer
      INTO v_active_services
      FROM public.services s
      WHERE s.business_id = r.id
        AND s.is_active;

      IF v_active_services = 0 THEN
        IF public._insert_operator_lifecycle_notification(
          p_business_id := r.id,
          p_appointment_id := NULL,
          p_event_type := 'onboarding.no_services',
          p_title := 'Faltan servicios',
          p_body := 'Todavía no hay un servicio activo.',
          p_idempotency_key := 'once'
        ) THEN
          UPDATE public.business_settings
          SET onboarding_no_services_notified_at = now()
          WHERE business_id = r.id;
          v_count := v_count + 1;
        END IF;
      END IF;
    END IF;

    IF v_day_n >= 2 AND r.onboarding_no_hours_notified_at IS NULL THEN
      SELECT NOT EXISTS (
        SELECT 1
        FROM jsonb_each(coalesce(r.working_hours, '{}'::jsonb)) AS weekday(key, value)
        WHERE weekday.key IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')
          AND (value->>'enabled') = 'true'
      )
      INTO v_hours_all_closed;

      IF v_hours_all_closed THEN
        IF public._insert_operator_lifecycle_notification(
          p_business_id := r.id,
          p_appointment_id := NULL,
          p_event_type := 'onboarding.no_hours',
          p_title := 'Faltan horarios',
          p_body := 'No hay un día con horario habilitado.',
          p_idempotency_key := 'once'
        ) THEN
          UPDATE public.business_settings
          SET onboarding_no_hours_notified_at = now()
          WHERE business_id = r.id;
          v_count := v_count + 1;
        END IF;
      END IF;
    END IF;

    IF v_day_n >= 3
       AND r.onboarding_copy_link_notified_at IS NULL
       AND r.booking_link_copied_at IS NULL
       AND r.slug IS NOT NULL
       AND btrim(r.slug) <> '' THEN
      SELECT count(*)::integer
      INTO v_active_services
      FROM public.services s
      WHERE s.business_id = r.id
        AND s.is_active;

      SELECT EXISTS (
        SELECT 1
        FROM jsonb_each(coalesce(r.working_hours, '{}'::jsonb)) AS weekday(key, value)
        WHERE (value->>'enabled') = 'true'
          AND (
            (
              nullif(btrim(value->>'start'), '') IS NOT NULL
              AND nullif(btrim(value->>'end'), '') IS NOT NULL
            )
            OR (
              jsonb_typeof(value->'intervals') = 'array'
              AND jsonb_array_length(value->'intervals') > 0
            )
          )
      )
      INTO v_has_enabled_interval;

      IF v_active_services >= 1 AND v_has_enabled_interval THEN
        IF public._insert_operator_lifecycle_notification(
          p_business_id := r.id,
          p_appointment_id := NULL,
          p_event_type := 'onboarding.copy_link',
          p_title := 'Compartí tu link',
          p_body := format('Tu turnero está listo. https://orvel.pro/booking/%s', r.slug),
          p_idempotency_key := 'once'
        ) THEN
          UPDATE public.business_settings
          SET onboarding_copy_link_notified_at = now()
          WHERE business_id = r.id;
          v_count := v_count + 1;
        END IF;
      END IF;
    END IF;

    IF v_day_n >= 7 AND r.onboarding_share_day7_notified_at IS NULL THEN
      SELECT count(*)::integer
      INTO v_public_count
      FROM public.bookings bk
      WHERE bk.business_id = r.id
        AND bk.source = 'client-self-service';

      IF v_public_count = 0 THEN
        IF public._insert_operator_lifecycle_notification(
          p_business_id := r.id,
          p_appointment_id := NULL,
          p_event_type := 'onboarding.share_day7',
          p_title := 'Sin reservas públicas',
          p_body := 'A una semana, nadie reservó desde el link.',
          p_idempotency_key := 'once'
        ) THEN
          UPDATE public.business_settings
          SET onboarding_share_day7_notified_at = now()
          WHERE business_id = r.id;
          v_count := v_count + 1;
        END IF;
      END IF;
    END IF;

    v_first_id := NULL;
    v_first_starts := NULL;
    v_first_name := NULL;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_operator_lifecycle_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_operator_lifecycle_pushes() TO service_role;

CREATE OR REPLACE FUNCTION public.mark_booking_link_copied(p_business_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_copied_at timestamptz;
BEGIN
  IF NOT public.can_manage_business(p_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  UPDATE public.business_settings
  SET booking_link_copied_at = COALESCE(booking_link_copied_at, now())
  WHERE business_id = p_business_id
  RETURNING booking_link_copied_at INTO v_copied_at;

  RETURN v_copied_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_link_copied(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_booking_link_copied(uuid) TO authenticated;

COMMIT;
