-- Disposable 100-tenant booking sandbox (lun-sab).
-- Namespaced slugs sandbox-v1-* only. Does not mutate the official QA seed business.
-- Apply on local/ephemeral/qa-dev Supabase, never production:
--   supabase db execute --project-ref <qa-dev> --file supabase/seeds/sandbox-10-businesses.sql
-- Wipe is the DELETE block at the top; re-running is idempotent.

BEGIN;

DELETE FROM public.notification_email_outbox
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.dashboard_notifications
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.bookings
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.customers
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.blocked_times
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.professional_services
WHERE professional_id IN (
  SELECT p.id
  FROM public.professionals p
  JOIN public.businesses b ON b.id = p.business_id
  WHERE b.slug LIKE 'sandbox-v1-%'
);

DELETE FROM public.professionals
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.services
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.business_settings
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.branches
WHERE business_id IN (SELECT id FROM public.businesses WHERE slug LIKE 'sandbox-v1-%');

DELETE FROM public.businesses
WHERE slug LIKE 'sandbox-v1-%';

DO $$
DECLARE
  r record;
  v_business_id uuid;
  v_service_id uuid;
  v_pro_id uuid;
  v_i integer;
  v_hours jsonb := '{
    "monday":{"enabled":true,"start":"09:00","end":"18:00"},
    "tuesday":{"enabled":true,"start":"09:00","end":"18:00"},
    "wednesday":{"enabled":true,"start":"09:00","end":"18:00"},
    "thursday":{"enabled":true,"start":"09:00","end":"18:00"},
    "friday":{"enabled":true,"start":"09:00","end":"18:00"},
    "saturday":{"enabled":true,"start":"09:00","end":"18:00"},
    "sunday":{"enabled":false,"start":"10:00","end":"14:00"}
  }'::jsonb;
BEGIN
  FOR r IN
    WITH cycle(idx, label, pro_count, duration_minutes) AS (
      VALUES
        (0, 'micro', 1, 30),
        (1, 'micro', 1, 30),
        (2, 'micro', 1, 60),
        (3, 'small', 2, 30),
        (4, 'small', 2, 30),
        (5, 'small', 2, 60),
        (6, 'mid',   3, 30),
        (7, 'mid',   4, 30),
        (8, 'peak',  5, 30),
        (9, 'peak',  6, 30)
    )
    SELECT
      g AS n,
      format('sandbox-v1-%s-%s', c.label, lpad(g::text, 3, '0')) AS slug,
      format('Sandbox %s %s', c.label, lpad(g::text, 3, '0')) AS name,
      c.pro_count,
      c.duration_minutes
    FROM generate_series(1, 100) AS g
    JOIN cycle c ON c.idx = (g - 1) % 10
  LOOP
    v_business_id := format('00000000-5a00-4000-a000-01%s0000000', lpad(r.n::text, 3, '0'))::uuid;
    v_service_id := format('00000000-5a00-4000-a000-02%s0000000', lpad(r.n::text, 3, '0'))::uuid;

    INSERT INTO public.businesses (id, slug, name, timezone)
    VALUES (v_business_id, r.slug, r.name, 'America/Argentina/Buenos_Aires')
    ON CONFLICT (id) DO UPDATE
      SET slug = EXCLUDED.slug,
          name = EXCLUDED.name,
          timezone = EXCLUDED.timezone;

    INSERT INTO public.business_settings (
      business_id,
      buffer_minutes,
      min_notice_minutes,
      slot_interval_minutes,
      working_hours,
      auto_confirm,
      auto_assign_professional,
      deposit_enabled,
      deposit_percent,
      max_advance_days
    )
    VALUES (
      v_business_id,
      0,
      0,
      30,
      v_hours,
      true,
      true,
      false,
      0,
      60
    )
    ON CONFLICT (business_id) DO UPDATE
      SET buffer_minutes = EXCLUDED.buffer_minutes,
          min_notice_minutes = EXCLUDED.min_notice_minutes,
          slot_interval_minutes = EXCLUDED.slot_interval_minutes,
          working_hours = EXCLUDED.working_hours,
          auto_confirm = EXCLUDED.auto_confirm,
          auto_assign_professional = EXCLUDED.auto_assign_professional,
          deposit_enabled = EXCLUDED.deposit_enabled,
          deposit_percent = EXCLUDED.deposit_percent,
          max_advance_days = EXCLUDED.max_advance_days;

    INSERT INTO public.services (
      id, business_id, name, description, duration_minutes, price, is_active
    )
    VALUES (
      v_service_id,
      v_business_id,
      'Servicio sandbox',
      'Servicio de ensayo de capacidad',
      r.duration_minutes,
      5000.00,
      true
    )
    ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          duration_minutes = EXCLUDED.duration_minutes,
          is_active = true;

    FOR v_i IN 1 .. r.pro_count LOOP
      v_pro_id := format(
        '00000000-5a00-4000-a000-03%s%s00000',
        lpad(r.n::text, 3, '0'),
        lpad(v_i::text, 2, '0')
      )::uuid;

      INSERT INTO public.professionals (id, business_id, name, active)
      VALUES (v_pro_id, v_business_id, format('Pro %s-%s', r.n, v_i), true)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            active = true,
            deleted_at = NULL;

      INSERT INTO public.professional_services (professional_id, service_id)
      VALUES (v_pro_id, v_service_id)
      ON CONFLICT (professional_id, service_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
