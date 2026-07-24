-- Add customer cancellation email to handle_booking_notifications.
-- Phase 3 of 3-phase migration (must deploy AFTER relax_business_email_outbox).
--
-- Changes:
-- 1. handle_booking_notifications: restructure with TG_OP conditions.
--    INSERT path keeps existing behavior; UPDATE cancel path adds
--    dashboard_notification (appointment.cancelled) and enqueues
--    appointment_cancelled email for booking_user.

BEGIN;

-- ---------------------------------------------------------------------------
-- handle_booking_notifications — add UPDATE cancel handling
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_name text;
  v_business_name text;
  v_service_name text;
  v_customer_email text;
BEGIN
  -- Public self-service bookings are handled atomically by create_public_booking.
  IF NEW.source = 'client-self-service' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, email INTO v_customer_name, v_customer_email
  FROM public.customers
  WHERE id = NEW.customer_id;

  SELECT name INTO v_business_name
  FROM public.businesses
  WHERE id = NEW.business_id;

  SELECT name INTO v_service_name
  FROM public.services
  WHERE id::text = NEW.service_id::text;

  v_customer_name := COALESCE(v_customer_name, 'Cliente');
  v_business_name := COALESCE(v_business_name, 'Orvel');
  v_service_name := COALESCE(v_service_name, 'Servicio');

  -- INSERT: new booking created by admin
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

    IF v_customer_email IS NOT NULL THEN
      INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
      SELECT NEW.business_id, NEW.id, v_customer_email, 'booking_created', jsonb_build_object(
        'customer_name', v_customer_name,
        'service_name', v_service_name,
        'starts_at', NEW.starts_at,
        'business_name', v_business_name
      )
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notification_email_outbox neo
        WHERE neo.booking_id = NEW.id AND neo.template_key = 'booking_created'
      );
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE cancel: booking cancelled (not already cancelled)
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
    VALUES (
      NEW.business_id,
      NEW.id,
      'appointment.cancelled',
      'Turno cancelado',
      'El turno de ' || v_customer_name || ' fue cancelado.',
      jsonb_build_object('customer_name', v_customer_name)
    );

    IF v_customer_email IS NOT NULL THEN
      PERFORM public._enqueue_booking_lifecycle_email(
        NEW,
        'booking_user',
        'appointment_cancelled',
        v_customer_email,
        'booking:' || NEW.id::text || ':cancelled:booking_user'
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
