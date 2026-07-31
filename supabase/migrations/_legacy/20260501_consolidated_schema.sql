-- Consolidated schema migration (equivalent to legacy migrations #1 #2 #3)
-- Idempotent by design for fresh installs and safe re-runs.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  business_name text,
  slug text,
  support_email text,
  support_phone text,
  buffer_minutes integer DEFAULT 15,
  min_notice_minutes integer DEFAULT 120,
  slot_interval_minutes integer DEFAULT 30,
  working_hours jsonb DEFAULT '{"monday":{"enabled":true,"start":"09:00","end":"18:00"},"tuesday":{"enabled":true,"start":"09:00","end":"18:00"},"wednesday":{"enabled":true,"start":"09:00","end":"18:00"},"thursday":{"enabled":true,"start":"09:00","end":"18:00"},"friday":{"enabled":true,"start":"09:00","end":"18:00"},"saturday":{"enabled":false,"start":"09:00","end":"13:00"},"sunday":{"enabled":false,"start":"09:00","end":"13:00"}}'::jsonb,
  send_appointment_reminders_24h boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'completed', 'no_show')),
  manage_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blocked_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL,
  currency text DEFAULT 'ARS',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.plans(code),
  status text NOT NULL DEFAULT 'active',
  next_billing_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  recipient_role text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  title text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notification_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  template_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_business_owner(p_business_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND owner_id = auth.uid());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS "Owners manage their business" ON public.businesses;
DROP POLICY IF EXISTS "Public view businesses" ON public.businesses;
DROP POLICY IF EXISTS "Owners manage settings" ON public.business_settings;
DROP POLICY IF EXISTS "Public view settings" ON public.business_settings;
DROP POLICY IF EXISTS "Owners manage customers" ON public.customers;
DROP POLICY IF EXISTS "Owners manage services" ON public.services;
DROP POLICY IF EXISTS "Public view services" ON public.services;
DROP POLICY IF EXISTS "Owners manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Public create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Public view own booking" ON public.bookings;
DROP POLICY IF EXISTS "Owners manage blocked times" ON public.blocked_times;
DROP POLICY IF EXISTS "Owners manage notifications" ON public.dashboard_notifications;
DROP POLICY IF EXISTS "Service role outbox" ON public.notification_email_outbox;

CREATE POLICY "Owners manage their business" ON public.businesses FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "Public view businesses" ON public.businesses FOR SELECT USING (true);
CREATE POLICY "Owners manage settings" ON public.business_settings FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Public view settings" ON public.business_settings FOR SELECT USING (true);
CREATE POLICY "Owners manage customers" ON public.customers FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Owners manage services" ON public.services FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Public view services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Owners manage bookings" ON public.bookings FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Public create bookings" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public view own booking" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Owners manage blocked times" ON public.blocked_times FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Owners manage notifications" ON public.dashboard_notifications FOR ALL USING (public.is_business_owner(business_id));
CREATE POLICY "Service role outbox" ON public.notification_email_outbox FOR ALL USING (auth.role() = 'service_role');

DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, uuid, text);
DROP FUNCTION IF EXISTS public.query_public_slot_availability(text, text, text);
CREATE OR REPLACE FUNCTION public.query_public_slot_availability(business_slug text, service_id text, date_iso text)
RETURNS TABLE (starts_at_iso text, ends_at_iso text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_business_id uuid; v_service_id uuid; v_target_date date; v_working_hours jsonb; v_day_key text; v_day_settings jsonb;
  v_slot_interval integer; v_buffer_minutes integer; v_min_notice_minutes integer; v_duration_minutes integer;
  v_start_time time; v_end_time time; v_timezone text; v_slot_start timestamptz; v_slot_end timestamptz; v_now timestamptz := now();
BEGIN
  SELECT id, timezone INTO v_business_id, v_timezone FROM public.businesses WHERE slug ILIKE business_slug;
  IF v_business_id IS NULL THEN RETURN; END IF;
  BEGIN v_service_id := service_id::uuid; EXCEPTION WHEN OTHERS THEN RETURN; END;
  SELECT COALESCE(slot_interval_minutes, 30), COALESCE(buffer_minutes, 10), COALESCE(min_notice_minutes, 120), working_hours
  INTO v_slot_interval, v_buffer_minutes, v_min_notice_minutes, v_working_hours
  FROM public.business_settings WHERE business_id = v_business_id;
  IF v_working_hours IS NULL THEN RETURN; END IF;
  SELECT duration_minutes INTO v_duration_minutes FROM public.services WHERE id = v_service_id;
  IF v_duration_minutes IS NULL THEN v_duration_minutes := 30; END IF;
  v_target_date := date_iso::date;
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
  IF v_day_settings IS NULL OR NOT (v_day_settings->>'enabled')::boolean THEN RETURN; END IF;
  v_start_time := (v_day_settings->>'start')::time; v_end_time := (v_day_settings->>'end')::time;
  v_slot_start := timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_start_time)::timestamp);
  WHILE (v_slot_start + (v_duration_minutes || ' minutes')::interval) <= timezone(COALESCE(v_timezone, 'UTC'), (v_target_date + v_end_time)::timestamp) LOOP
    v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;
    IF v_slot_start >= (v_now + (v_min_notice_minutes || ' minutes')::interval)
      AND NOT EXISTS (SELECT 1 FROM public.bookings WHERE business_id = v_business_id AND status NOT IN ('cancelled', 'rejected') AND (starts_at - (v_buffer_minutes || ' minutes')::interval) < v_slot_end AND (ends_at + (v_buffer_minutes || ' minutes')::interval) > v_slot_start)
      AND NOT EXISTS (SELECT 1 FROM public.blocked_times WHERE business_id = v_business_id AND starts_at < v_slot_end AND ends_at > v_slot_start)
    THEN starts_at_iso := v_slot_start::text; ends_at_iso := v_slot_end::text; RETURN NEXT; END IF;
    v_slot_start := v_slot_start + (v_slot_interval || ' minutes')::interval;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_booking_notifications()
RETURNS trigger AS $$
DECLARE
  v_customer_name text; v_business_name text; v_service_name text; v_customer_email text; v_owner_email text; v_owner_id uuid;
BEGIN
  SELECT full_name, email INTO v_customer_name, v_customer_email FROM public.customers WHERE id::text = NEW.customer_id::text;
  SELECT name, owner_id INTO v_business_name, v_owner_id FROM public.businesses WHERE id::text = NEW.business_id::text;
  SELECT name INTO v_service_name FROM public.services WHERE id::text = NEW.service_id::text;
  IF v_owner_id IS NOT NULL THEN SELECT email INTO v_owner_email FROM auth.users WHERE id::text = v_owner_id::text; END IF;
  v_customer_name := COALESCE(v_customer_name, 'Cliente'); v_business_name := COALESCE(v_business_name, 'Orvel'); v_service_name := COALESCE(v_service_name, 'Servicio');
  INSERT INTO public.dashboard_notifications (business_id, appointment_id, event_type, title, body, metadata)
  VALUES (NEW.business_id, NEW.id, 'appointment.created', 'Nuevo turno', 'El cliente ' || v_customer_name || ' reservó ' || v_service_name || '.', jsonb_build_object('customer_name', v_customer_name));
  IF v_customer_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    VALUES (NEW.business_id, NEW.id, v_customer_email, 'booking_created', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name));
  END IF;
  IF v_owner_email IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    VALUES (NEW.business_id, NEW.id, v_owner_email, 'booking_created_business', jsonb_build_object('customer_name', v_customer_name, 'service_name', v_service_name, 'starts_at', NEW.starts_at, 'business_name', v_business_name));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_booking_notifications ON public.bookings;
CREATE TRIGGER trigger_booking_notifications AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.handle_booking_notifications();

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders_24h()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer := 0; v_booking record;
BEGIN
  FOR v_booking IN
    SELECT b.id, b.business_id, b.starts_at, c.email as customer_email, c.full_name as customer_name, biz.name as business_name, s.name as service_name
    FROM public.bookings b
    JOIN public.customers c ON c.id = b.customer_id
    JOIN public.businesses biz ON biz.id = b.business_id
    JOIN public.services s ON s.id = b.service_id
    JOIN public.business_settings bs ON bs.business_id = biz.id
    WHERE b.status = 'booked' AND b.starts_at > now() + interval '23 hours' AND b.starts_at < now() + interval '25 hours'
      AND bs.send_appointment_reminders_24h = true
      AND NOT EXISTS (SELECT 1 FROM public.notification_email_outbox neo WHERE neo.booking_id = b.id AND neo.template_key = 'appointment_reminder_24h')
  LOOP
    INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
    VALUES (v_booking.business_id, v_booking.id, v_booking.customer_email, 'appointment_reminder_24h', jsonb_build_object('customer_name', v_booking.customer_name, 'service_name', v_booking.service_name, 'starts_at', v_booking.starts_at, 'business_name', v_booking.business_name));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_business_slug()
RETURNS trigger AS $$ BEGIN UPDATE public.business_settings SET slug = NEW.slug WHERE business_id = NEW.id; RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_sync_business_slug ON public.businesses;
CREATE TRIGGER trigger_sync_business_slug AFTER UPDATE OF slug ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.sync_business_slug();

COMMIT;
NOTIFY pgrst, 'reload schema';
