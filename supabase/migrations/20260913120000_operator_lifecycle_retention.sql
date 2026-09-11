-- Slice 3: retention once-flags, instant #9/#11 triggers, clock RPC branch #10.
-- Keeps ops 1–4 and onboarding 5–8. Clock must not insert #9/#11.

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS retention_first_public_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_gap7_notified_at timestamptz;

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
  v_last_public record;
BEGIN
  FOR r IN
    SELECT
      businesses.id,
      businesses.account_closed_at,
      businesses.created_at,
      businesses.slug,
      businesses.public_turnero_disabled_at,
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

    SELECT bk.id, bk.created_at
    INTO v_last_public
    FROM public.bookings bk
    WHERE bk.business_id = r.id
      AND bk.source = 'client-self-service'
    ORDER BY bk.created_at DESC
    LIMIT 1;

    IF v_last_public.id IS NOT NULL
       AND r.public_turnero_disabled_at IS NULL
       AND v_last_public.created_at < now() - interval '7 days'
       AND EXISTS (
         SELECT 1
         FROM public.business_settings
         WHERE business_id = r.id
           AND (retention_gap7_notified_at IS NULL OR retention_gap7_notified_at < v_last_public.created_at)
       ) THEN
      IF public._insert_operator_lifecycle_notification(
        p_business_id := r.id,
        p_appointment_id := v_last_public.id,
        p_event_type := 'retention.public_gap_7d',
        p_title := '7 días sin reservas públicas',
        p_body := 'La última reserva pública fue hace más de una semana.',
        p_idempotency_key := 'booking:' || v_last_public.id::text
      ) THEN
        UPDATE public.business_settings
        SET retention_gap7_notified_at = now()
        WHERE business_id = r.id;
        v_count := v_count + 1;
      END IF;
    END IF;

    v_first_id := NULL;
    v_first_starts := NULL;
    v_first_name := NULL;
    v_last_public := NULL;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_operator_lifecycle_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_operator_lifecycle_pushes() TO service_role;

CREATE OR REPLACE FUNCTION public.trgfn_operator_lifecycle_first_public_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_public_count integer;
  v_name text;
BEGIN
  IF NEW.source IS DISTINCT FROM 'client-self-service' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = NEW.business_id
      AND b.account_closed_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.business_settings bs
    WHERE bs.business_id = NEW.business_id
      AND bs.retention_first_public_notified_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
  INTO v_public_count
  FROM public.bookings bk
  WHERE bk.business_id = NEW.business_id
    AND bk.source = 'client-self-service';

  IF v_public_count <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(c.full_name, 'Cliente')
  INTO v_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  PERFORM public._insert_operator_lifecycle_notification(
    p_business_id := NEW.business_id,
    p_appointment_id := NEW.id,
    p_event_type := 'retention.first_public_booking',
    p_title := 'Primera reserva pública',
    p_body := format('%s reservó desde el turnero.', coalesce(v_name, 'Cliente')),
    p_idempotency_key := 'booking:' || NEW.id::text
  );

  UPDATE public.business_settings
  SET retention_first_public_notified_at = now()
  WHERE business_id = NEW.business_id
    AND retention_first_public_notified_at IS NULL;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_lifecycle_first_public_booking ON public.bookings;
CREATE TRIGGER trg_operator_lifecycle_first_public_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_operator_lifecycle_first_public_booking();

REVOKE ALL ON FUNCTION public.trgfn_operator_lifecycle_first_public_booking()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trgfn_operator_lifecycle_customer_cancelled_twice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cancel_count integer;
  v_name text;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = NEW.business_id
      AND b.account_closed_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
  INTO v_cancel_count
  FROM public.bookings bk
  WHERE bk.business_id = NEW.business_id
    AND bk.customer_id = NEW.customer_id
    AND bk.status = 'cancelled';

  IF v_cancel_count <> 2 THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(c.full_name, 'Cliente')
  INTO v_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  PERFORM public._insert_operator_lifecycle_notification(
    p_business_id := NEW.business_id,
    p_appointment_id := NEW.id,
    p_event_type := 'retention.customer_cancelled_twice',
    p_title := 'Mismo cliente canceló dos veces',
    p_body := format('%s ya tiene dos cancelaciones.', coalesce(v_name, 'Cliente')),
    p_idempotency_key := 'customer:' || NEW.customer_id::text || ':cancel-2'
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_lifecycle_customer_cancelled_twice ON public.bookings;
CREATE TRIGGER trg_operator_lifecycle_customer_cancelled_twice
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_operator_lifecycle_customer_cancelled_twice();

REVOKE ALL ON FUNCTION public.trgfn_operator_lifecycle_customer_cancelled_twice()
  FROM PUBLIC, anon, authenticated;

COMMIT;
