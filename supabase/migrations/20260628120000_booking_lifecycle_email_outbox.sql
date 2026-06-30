-- Centralize booking lifecycle email notification outbox writes in Postgres.
-- Matrix:
-- - created: booking_user + business_client
-- - rescheduled: booking_user only
-- - cancelled: business_client only

BEGIN;
ALTER TABLE public.notification_email_outbox
  ADD COLUMN IF NOT EXISTS lifecycle_event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_email_outbox_lifecycle_event_key_idx
  ON public.notification_email_outbox (lifecycle_event_key)
  WHERE lifecycle_event_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public._resolve_booking_business_email(p_business_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_owner_id uuid;
BEGIN
  -- Existing app-side lifecycle notifications preferred business_settings.support_email,
  -- then fell back to the owning user's email. Keep that order centralized here.
  SELECT NULLIF(btrim(bs.support_email), '')
  INTO v_email
  FROM public.business_settings bs
  WHERE bs.business_id = p_business_id;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  SELECT b.owner_id
  INTO v_owner_id
  FROM public.businesses b
  WHERE b.id = p_business_id;

  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(u.email), '')
  INTO v_email
  FROM auth.users u
  WHERE u.id = v_owner_id;

  RETURN v_email;
END;
$$;
CREATE OR REPLACE FUNCTION public._booking_lifecycle_email_payload(p_booking public.bookings)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'booking_id', p_booking.id,
    'customer_name', COALESCE(c.full_name, 'Cliente'),
    'service_name', COALESCE(s.name, 'Servicio'),
    'starts_at', p_booking.starts_at,
    'business_name', COALESCE(b.name, 'Orvel'),
    'business_phone', bs.support_phone,
    'business_support_email', bs.support_email
  )
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  LEFT JOIN public.customers c ON c.id = p_booking.customer_id
  LEFT JOIN public.services s ON s.id::text = p_booking.service_id::text
  WHERE b.id = p_booking.business_id;
$$;
CREATE OR REPLACE FUNCTION public._enqueue_booking_lifecycle_email(
  p_booking public.bookings,
  p_recipient_role text,
  p_template_key text,
  p_to_email text,
  p_event_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_to_email text := NULLIF(btrim(p_to_email), '');
BEGIN
  IF p_booking.id IS NULL OR v_to_email IS NULL OR p_template_key IS NULL OR p_event_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_email_outbox (
    business_id,
    booking_id,
    to_email,
    template_key,
    payload,
    lifecycle_event_key
  )
  VALUES (
    p_booking.business_id,
    p_booking.id,
    v_to_email,
    p_template_key,
    COALESCE(public._booking_lifecycle_email_payload(p_booking), '{}'::jsonb)
      || jsonb_build_object('recipient_role', p_recipient_role, 'lifecycle_event_key', p_event_key),
    p_event_key
  )
  ON CONFLICT (lifecycle_event_key) WHERE lifecycle_event_key IS NOT NULL DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.handle_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_name text;
  v_customer_email text;
  v_business_email text;
  v_service_name text;
BEGIN
  SELECT c.full_name, c.email
  INTO v_customer_name, v_customer_email
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  SELECT s.name
  INTO v_service_name
  FROM public.services s
  WHERE s.id::text = NEW.service_id::text;

  v_customer_name := COALESCE(v_customer_name, 'Cliente');
  v_service_name := COALESCE(v_service_name, 'Servicio');
  v_business_email := public._resolve_booking_business_email(NEW.business_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
    VALUES (
      NEW.business_id,
      NEW.id,
      'appointment.created',
      'Nuevo turno',
      'El cliente ' || v_customer_name || ' reservó ' || v_service_name || '.',
      jsonb_build_object('customer_name', v_customer_name)
    );

    PERFORM public._enqueue_booking_lifecycle_email(
      NEW,
      'booking_user',
      'appointment_confirmation',
      v_customer_email,
      'booking:' || NEW.id::text || ':created:booking_user'
    );

    PERFORM public._enqueue_booking_lifecycle_email(
      NEW,
      'business_client',
      'booking_created_business',
      v_business_email,
      'booking:' || NEW.id::text || ':created:business_client'
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.status = 'cancelled' THEN
    PERFORM public._enqueue_booking_lifecycle_email(
      NEW,
      'business_client',
      'booking_cancelled_business',
      v_business_email,
      'booking:' || NEW.id::text || ':cancelled:business_client'
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM 'cancelled'
     AND OLD.starts_at IS DISTINCT FROM NEW.starts_at THEN
    PERFORM public._enqueue_booking_lifecycle_email(
      NEW,
      'booking_user',
      'booking_rescheduled',
      v_customer_email,
      'booking:' || NEW.id::text || ':rescheduled:' || NEW.starts_at::text || ':' || COALESCE(NEW.updated_at::text, statement_timestamp()::text) || ':booking_user'
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_booking_notifications ON public.bookings;
CREATE TRIGGER trigger_booking_notifications
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.handle_booking_notifications();
DROP TRIGGER IF EXISTS trigger_booking_lifecycle_email_updates ON public.bookings;
CREATE TRIGGER trigger_booking_lifecycle_email_updates
AFTER UPDATE OF status, starts_at ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.starts_at IS DISTINCT FROM NEW.starts_at)
EXECUTE FUNCTION public.handle_booking_notifications();
REVOKE ALL ON FUNCTION public._resolve_booking_business_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._booking_lifecycle_email_payload(public.bookings) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._enqueue_booking_lifecycle_email(public.bookings, text, text, text, text) FROM PUBLIC;
COMMIT;
NOTIFY pgrst, 'reload schema';
