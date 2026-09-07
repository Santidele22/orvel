-- Client deposit emails: instructions on pending self-service insert,
-- confirmation links reminted on operator confirm, hold-released on timeout.
-- Does not rewrite create_public_booking or release_expired_booking_hold.

BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_deposit_instructions_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_email text;
  v_customer_name text;
  v_service_name text;
  v_deposit_alias text;
  v_deposit_cbu text;
BEGIN
  SELECT nullif(btrim(c.email), ''), c.full_name
    INTO v_customer_email, v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  IF v_customer_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(btrim(bs.deposit_alias), ''), nullif(btrim(bs.deposit_cbu), '')
    INTO v_deposit_alias, v_deposit_cbu
  FROM public.business_settings bs
  WHERE bs.business_id = NEW.business_id;

  SELECT s.name
    INTO v_service_name
  FROM public.services s
  WHERE s.id::text = NEW.service_id::text;

  INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
  SELECT NEW.business_id, NEW.id, v_customer_email, 'appointment_deposit_instructions', jsonb_build_object(
    'booking_id', NEW.id,
    'starts_at', NEW.starts_at,
    'customer_name', COALESCE(v_customer_name, 'Cliente'),
    'service_name', COALESCE(v_service_name, 'Servicio'),
    'deposit_amount', NEW.deposit_amount_pesos,
    'deposit_alias', v_deposit_alias,
    'deposit_cbu', v_deposit_cbu,
    'deposit_code', NEW.deposit_code,
    'deposit_hold_minutes', 30
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notification_email_outbox neo
    WHERE neo.booking_id = NEW.id AND neo.template_key = 'appointment_deposit_instructions'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_appointment_deposit_instructions_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enqueue_appointment_deposit_instructions_email ON public.bookings;
CREATE TRIGGER trg_enqueue_appointment_deposit_instructions_email
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.deposit_status = 'pending' AND NEW.source = 'client-self-service')
  EXECUTE FUNCTION public.enqueue_appointment_deposit_instructions_email();

CREATE OR REPLACE FUNCTION public.enqueue_appointment_hold_released_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_email text;
  v_customer_name text;
  v_service_name text;
BEGIN
  SELECT nullif(btrim(c.email), ''), c.full_name
    INTO v_customer_email, v_customer_name
  FROM public.customers c
  WHERE c.id = NEW.customer_id;

  IF v_customer_email IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.name
    INTO v_service_name
  FROM public.services s
  WHERE s.id::text = NEW.service_id::text;

  INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
  SELECT NEW.business_id, NEW.id, v_customer_email, 'appointment_hold_released', jsonb_build_object(
    'booking_id', NEW.id,
    'starts_at', NEW.starts_at,
    'customer_name', COALESCE(v_customer_name, 'Cliente'),
    'service_name', COALESCE(v_service_name, 'Servicio')
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notification_email_outbox neo
    WHERE neo.booking_id = NEW.id AND neo.template_key = 'appointment_hold_released'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_appointment_hold_released_email() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enqueue_appointment_hold_released_email ON public.bookings;
CREATE TRIGGER trg_enqueue_appointment_hold_released_email
  AFTER UPDATE OF deposit_status ON public.bookings
  FOR EACH ROW
  WHEN (NEW.deposit_status = 'released' AND OLD.deposit_status IN ('pending', 'claim_pending'))
  EXECUTE FUNCTION public.enqueue_appointment_hold_released_email();

CREATE OR REPLACE FUNCTION public.confirm_booking_deposit_received(
  booking_id uuid,
  performed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings;
  v_customer_email text;
  v_customer_name text;
  v_service_name text;
  v_management_bearer text;
BEGIN
  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = confirm_booking_deposit_received.booking_id;

  IF v_booking.id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_CONFIRM_REJECTED');
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.can_manage_business(v_booking.business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  PERFORM public.release_expired_booking_hold(v_booking.id, v_booking.business_id);

  SELECT bk.* INTO v_booking
  FROM public.bookings bk
  WHERE bk.id = v_booking.id;

  IF v_booking.deposit_status NOT IN ('pending', 'claim_pending') THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_CONFIRM_REJECTED');
  END IF;

  UPDATE public.bookings
  SET deposit_status = 'paid',
      updated_at = now()
  WHERE id = v_booking.id
    AND deposit_status IN ('pending', 'claim_pending');

  IF NOT FOUND THEN
    PERFORM public._raise_rpc('BOOKING_DEPOSIT_CONFIRM_REJECTED');
  END IF;

  v_management_bearer := encode(extensions.gen_random_bytes(32), 'hex');

  UPDATE public.bookings
  SET manage_token_hash = public._hash_manage_token(v_management_bearer),
      manage_token_expires_at = v_booking.ends_at + interval '1 hour',
      updated_at = now()
  WHERE id = v_booking.id;

  SELECT nullif(btrim(c.email), ''), c.full_name
    INTO v_customer_email, v_customer_name
  FROM public.customers c
  WHERE c.id = v_booking.customer_id;

  SELECT s.name
    INTO v_service_name
  FROM public.services s
  WHERE s.id::text = v_booking.service_id::text;

  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    SELECT v_booking.business_id, v_booking.id, v_customer_email, 'appointment_confirmation', jsonb_build_object(
      'booking_id', v_booking.id,
      'starts_at', v_booking.starts_at,
      'customer_name', COALESCE(v_customer_name, 'Cliente'),
      'service_name', COALESCE(v_service_name, 'Servicio'),
      'links', jsonb_build_object(
        'view', '/booking/manage?token=' || v_management_bearer,
        'cancel', '/booking/manage?token=' || v_management_bearer || '&action=cancel',
        'reschedule', '/booking/manage?token=' || v_management_bearer || '&action=reschedule'
      )
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notification_email_outbox neo
      WHERE neo.booking_id = v_booking.id AND neo.template_key = 'appointment_confirmation'
    );
  END IF;

  RETURN jsonb_build_object('booking_id', v_booking.id, 'deposit_status', 'paid');
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_deposit_received(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_booking_deposit_received(uuid, uuid) TO authenticated, service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
