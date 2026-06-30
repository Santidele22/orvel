-- Preserve public booking lifecycle emails after the public booking atomic-create migration.
-- The already-applied 20260629234000 migration must remain immutable; this
-- forward migration redefines only the notification trigger function.

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
  v_owner_email text;
  v_business_email text;
  v_owner_id uuid;
BEGIN
  -- Public self-service creates are handled atomically by create_public_booking.
  -- Updates must still flow through the lifecycle trigger so cancel/reschedule
  -- emails are not dropped after the booking has already been created.
  IF TG_OP = 'INSERT' AND NEW.source = 'client-self-service' THEN
    RETURN NEW;
  END IF;

  SELECT full_name, email INTO v_customer_name, v_customer_email FROM public.customers WHERE id::text = NEW.customer_id::text;
  SELECT name, owner_id INTO v_business_name, v_owner_id FROM public.businesses WHERE id::text = NEW.business_id::text;
  SELECT name INTO v_service_name FROM public.services WHERE id::text = NEW.service_id::text;
  IF v_owner_id IS NOT NULL THEN SELECT email INTO v_owner_email FROM auth.users WHERE id::text = v_owner_id::text; END IF;

  v_customer_name := COALESCE(v_customer_name, 'Cliente');
  v_business_name := COALESCE(v_business_name, 'Orvel');
  v_service_name := COALESCE(v_service_name, 'Servicio');
  v_business_email := public._resolve_booking_business_email(NEW.business_id);

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

    RETURN NEW;
  END IF;

  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  VALUES (NEW.business_id, NEW.id, 'appointment.created', 'Nuevo turno', 'El cliente ' || v_customer_name || ' reservó ' || v_service_name || '.', jsonb_build_object('customer_name', v_customer_name))
  ON CONFLICT DO NOTHING;

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT NEW.business_id, NEW.id, v_customer_email, 'booking_created', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = NEW.id AND neo.template_key = 'booking_created'
    );
  END IF;

  IF v_owner_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT NEW.business_id, NEW.id, v_owner_email, 'booking_created_business', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = NEW.id AND neo.template_key = 'booking_created_business'
    );
  END IF;

  RETURN NEW;
END;
$$;
