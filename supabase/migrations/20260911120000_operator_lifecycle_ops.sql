-- Slice 1: unique lifecycle idempotency, helper, ops clock RPC 1–4,
-- and latest enqueue_web_push_outbox allowlist (eleven spec strings).
-- Deploy this unique index before enabling the GitHub workflow.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_notifications_lifecycle_idempotency_uidx
  ON public.dashboard_notifications (
    business_id,
    event_type,
    (metadata->>'idempotency_key')
  )
  WHERE coalesce(metadata->>'idempotency_key', '') <> '';

CREATE OR REPLACE FUNCTION public._insert_operator_lifecycle_notification(
  p_business_id uuid,
  p_appointment_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.dashboard_notifications (
    business_id,
    appointment_id,
    event_type,
    title,
    body,
    metadata
  ) VALUES (
    p_business_id,
    p_appointment_id,
    p_event_type,
    p_title,
    p_body,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('idempotency_key', p_idempotency_key)
  );
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_operator_lifecycle_notification(uuid, uuid, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

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
  v_remaining_today integer;
  v_yesterday_started integer;
  v_first_id uuid;
  v_first_starts timestamptz;
  v_first_name text;
  v_claim record;
BEGIN
  FOR r IN
    SELECT
      businesses.id,
      businesses.account_closed_at,
      COALESCE(businesses.timezone, 'America/Argentina/Buenos_Aires') AS tz
    FROM public.businesses
  LOOP
    IF r.account_closed_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_tz := r.tz;
    v_local_ts := timezone(v_tz, now());
    v_local_date := v_local_ts::date;
    v_local_time := v_local_ts::time;

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

    v_first_id := NULL;
    v_first_starts := NULL;
    v_first_name := NULL;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_operator_lifecycle_pushes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_operator_lifecycle_pushes() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_web_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IN (
    'appointment.created',
    'appointment.cancelled',
    'appointment.rescheduled',
    'appointment.reminder',
    'lifecycle.briefing',
    'lifecycle.first_turno_soon',
    'lifecycle.empty_agenda',
    'lifecycle.stale_deposit_claim',
    'onboarding.no_services',
    'onboarding.no_hours',
    'onboarding.copy_link',
    'onboarding.share_day7',
    'retention.first_public_booking',
    'retention.public_gap_7d',
    'retention.customer_cancelled_twice'
  ) THEN
    INSERT INTO public.web_push_outbox (
      business_id,
      notification_id,
      event_type,
      title,
      body,
      status
    ) VALUES (
      NEW.business_id,
      NEW.id,
      NEW.event_type,
      NEW.title,
      NEW.body,
      'pending'
    )
    ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

COMMIT;
