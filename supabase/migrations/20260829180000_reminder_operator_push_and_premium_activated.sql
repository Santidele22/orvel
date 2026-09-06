-- Reminder: customer email only. Operator gets dashboard notification (desktop) + web push.
-- Premium: enqueue owner email when plan_code becomes PREMIUM.

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
    JOIN public.services s ON s.id::text = b.service_id
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
    'appointment.reminder'
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

CREATE OR REPLACE FUNCTION public.enqueue_premium_activated_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_email text;
  v_owner_name text;
  v_business_name text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(NEW.plan_code, '')) <> 'PREMIUM' THEN
    RETURN NEW;
  END IF;

  IF upper(coalesce(OLD.plan_code, '')) = 'PREMIUM' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_business_id := NEW.business_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  SELECT
    b.name,
    u.email,
    nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
  INTO v_business_name, v_email, v_owner_name
  FROM public.businesses b
  LEFT JOIN auth.users u ON u.id = b.owner_id
  LEFT JOIN public.profiles p ON p.id = b.owner_id
  WHERE b.id = v_business_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_email_outbox neo
    WHERE neo.business_id = v_business_id
      AND neo.template_key = 'premium_activated'
      AND neo.created_at > now() - interval '7 days'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_email_outbox (business_id, to_email, template_key, payload)
  VALUES (
    v_business_id,
    v_email,
    'premium_activated',
    jsonb_build_object(
      'business_name', coalesce(v_business_name, 'Tu negocio'),
      'owner_name', coalesce(v_owner_name, 'Propietario')
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_premium_activated_email ON public.business_subscriptions;
CREATE TRIGGER trg_enqueue_premium_activated_email
  AFTER UPDATE OF plan_code ON public.business_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_premium_activated_email();
