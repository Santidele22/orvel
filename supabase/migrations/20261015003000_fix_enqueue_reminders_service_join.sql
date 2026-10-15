-- Fix enqueue_appointment_reminders_24h: bookings.service_id is uuid, so the
-- services join must not cast only one side to text. The old predicate
-- (s.id::text = b.service_id) raised 42883 "operator does not exist: text = uuid"
-- on every invocation, so the 24h reminder enqueue never ran.
-- Body identical to 20260829180000 apart from the join predicate.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders_24h()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT b.id, b.business_id, b.starts_at, c.email AS customer_email, c.full_name AS customer_name, biz.name AS business_name, s.name AS service_name
    FROM public.bookings b
    JOIN public.customers c ON c.id = b.customer_id
    JOIN public.businesses biz ON biz.id = b.business_id
    JOIN public.services s ON s.id = b.service_id
    JOIN public.business_settings bs ON bs.business_id = biz.id
    WHERE b.status IN ('booked', 'confirmed')
      AND b.starts_at > now() + interval '23 hours'
      AND b.starts_at < now() + interval '25 hours'
      AND bs.send_appointment_reminders_24h = true
      AND c.email IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_email_outbox neo
        WHERE neo.booking_id = b.id AND neo.template_key = 'appointment_reminder_24h'
      )
  LOOP
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    VALUES (
      r.business_id,
      r.id,
      r.customer_email,
      'appointment_reminder_24h',
      jsonb_build_object(
        'customer_name', r.customer_name,
        'business_name', r.business_name,
        'service_name', r.service_name,
        'starts_at', r.starts_at
      )
    );

    INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
    SELECT
      r.business_id,
      r.id,
      'appointment.reminder',
      'Recordatorio de turno',
      format('Mañana: %s — %s', coalesce(r.customer_name, 'Cliente'), coalesce(r.service_name, 'Servicio')),
      jsonb_build_object('booking_id', r.id, 'starts_at', r.starts_at)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.dashboard_notifications dn
      WHERE dn.appointment_id = r.id AND dn.event_type = 'appointment.reminder'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_appointment_reminders_24h() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders_24h() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
