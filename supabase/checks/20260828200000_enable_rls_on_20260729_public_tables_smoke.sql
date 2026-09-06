-- Rollback-safe smoke for 20260828200000_enable_rls_on_20260729_public_tables.sql.
-- Run after pushing the migration with:
--   npx supabase@latest db query --linked < supabase/checks/20260828200000_enable_rls_on_20260729_public_tables_smoke.sql
-- Expected final row: check_name | PASS

BEGIN;

DO $$
DECLARE
  v_business_id constant uuid := '00000000-0000-0000-0000-00000000f901';
  v_professional_id constant uuid := '00000000-0000-0000-0000-00000000f902';
  v_service_id constant uuid := '00000000-0000-0000-0000-00000000f904';
  v_user_id constant uuid := '00000000-0000-0000-0000-00000000f905';
  v_hours_id constant uuid := '00000000-0000-0000-0000-00000000f906';
  v_client_id constant uuid := '00000000-0000-0000-0000-00000000f907';
  v_appointment_id constant uuid := '00000000-0000-0000-0000-00000000f908';
  v_notification_id constant uuid := '00000000-0000-0000-0000-00000000f909';
  v_outbox_id constant uuid := '00000000-0000-0000-0000-00000000f90a';
BEGIN
  INSERT INTO public.businesses (id, slug, name, timezone)
  VALUES (v_business_id, 'orvel-smoke-20260729-rls', 'Orvel Smoke 20260729 RLS', 'UTC');

  INSERT INTO public.professionals (id, business_id, name)
  VALUES (v_professional_id, v_business_id, 'Smoke Professional');

  INSERT INTO public.service_categories (id, business_id, name)
  VALUES ('00000000-0000-0000-0000-00000000f903', v_business_id, 'Smoke Category');

  INSERT INTO public.services (id, business_id, name, duration_minutes, price, is_active)
  VALUES (v_service_id, v_business_id, 'Smoke Service', 30, 1000, true);

  INSERT INTO public.professional_services (professional_id, service_id)
  VALUES (v_professional_id, v_service_id);

  INSERT INTO public.users (id, business_id, email, password_hash, role, name)
  VALUES (
    v_user_id,
    v_business_id,
    'orvel-smoke-554-users@example.test',
    'orvel-smoke-rls-lock-not-a-real-hash',
    'admin',
    'Smoke User'
  );

  INSERT INTO public.professional_hours (id, professional_id, day_of_week, start_time, end_time)
  VALUES (v_hours_id, v_professional_id, 1, '09:00', '18:00');

  INSERT INTO public.clients (id, business_id, name)
  VALUES (v_client_id, v_business_id, 'Smoke Client');

  INSERT INTO public.appointments (
    id,
    business_id,
    client_id,
    service_id,
    professional_id,
    date,
    start_time,
    end_time,
    status,
    source
  )
  VALUES (
    v_appointment_id,
    v_business_id,
    v_client_id,
    v_service_id,
    v_professional_id,
    '2026-08-28',
    '10:00',
    '10:30',
    'confirmado',
    'walk_in'
  );

  INSERT INTO public.notifications (id, business_id, user_id, type, title)
  VALUES (v_notification_id, v_business_id, v_user_id, 'system', 'Smoke notification');

  INSERT INTO public.email_outbox (id, business_id, to_email, subject)
  VALUES (v_outbox_id, v_business_id, 'orvel-smoke-554-outbox@example.test', 'Smoke subject');
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);

DO $$
DECLARE
  v_professional_id constant uuid := '00000000-0000-0000-0000-00000000f902';
  v_service_id constant uuid := '00000000-0000-0000-0000-00000000f904';
  v_user_id constant uuid := '00000000-0000-0000-0000-00000000f905';
  v_hours_id constant uuid := '00000000-0000-0000-0000-00000000f906';
  v_client_id constant uuid := '00000000-0000-0000-0000-00000000f907';
  v_appointment_id constant uuid := '00000000-0000-0000-0000-00000000f908';
  v_notification_id constant uuid := '00000000-0000-0000-0000-00000000f909';
  v_outbox_id constant uuid := '00000000-0000-0000-0000-00000000f90a';
  v_users_count integer;
  v_password_hash_count integer;
  v_professionals_count integer;
  v_professional_services_count integer;
  v_professional_hours_count integer;
  v_service_categories_count integer;
  v_clients_count integer;
  v_appointments_count integer;
  v_notifications_count integer;
  v_email_outbox_count integer;
BEGIN
  SELECT count(*) INTO v_users_count
  FROM public.users
  WHERE id = v_user_id;

  SELECT count(*) INTO v_password_hash_count
  FROM public.users
  WHERE id = v_user_id
    AND password_hash IS NOT NULL;

  SELECT count(*) INTO v_professionals_count
  FROM public.professionals
  WHERE id = v_professional_id;

  SELECT count(*) INTO v_professional_services_count
  FROM public.professional_services
  WHERE professional_id = v_professional_id
    AND service_id = v_service_id;

  SELECT count(*) INTO v_professional_hours_count
  FROM public.professional_hours
  WHERE id = v_hours_id;

  SELECT count(*) INTO v_service_categories_count
  FROM public.service_categories
  WHERE id = '00000000-0000-0000-0000-00000000f903';

  SELECT count(*) INTO v_clients_count
  FROM public.clients
  WHERE id = v_client_id;

  SELECT count(*) INTO v_appointments_count
  FROM public.appointments
  WHERE id = v_appointment_id;

  SELECT count(*) INTO v_notifications_count
  FROM public.notifications
  WHERE id = v_notification_id;

  SELECT count(*) INTO v_email_outbox_count
  FROM public.email_outbox
  WHERE id = v_outbox_id;

  IF v_users_count <> 0 OR v_password_hash_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.users password_hash, got % rows', v_users_count;
  END IF;

  IF v_professionals_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.professionals, got % rows', v_professionals_count;
  END IF;

  IF v_professional_services_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.professional_services, got % rows', v_professional_services_count;
  END IF;

  IF v_professional_hours_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.professional_hours, got % rows', v_professional_hours_count;
  END IF;

  IF v_service_categories_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.service_categories, got % rows', v_service_categories_count;
  END IF;

  IF v_clients_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.clients, got % rows', v_clients_count;
  END IF;

  IF v_appointments_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.appointments, got % rows', v_appointments_count;
  END IF;

  IF v_notifications_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.notifications, got % rows', v_notifications_count;
  END IF;

  IF v_email_outbox_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read public.email_outbox, got % rows', v_email_outbox_count;
  END IF;
END $$;

SELECT 'release_20260729_public_tables_rls_smoke' AS check_name, 'PASS' AS result;

ROLLBACK;
