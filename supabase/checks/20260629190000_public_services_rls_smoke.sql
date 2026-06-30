-- Rollback-safe smoke for 20260629190000_harden_public_services_rls.sql.
-- Run after pushing the migration with:
--   npx supabase@latest db query --linked < supabase/checks/20260629190000_public_services_rls_smoke.sql
-- Expected final row: public_services_rls_smoke | PASS

BEGIN;

DO $$
DECLARE
  v_business_id constant uuid := '00000000-0000-0000-0000-00000000f101';
  v_active_service_id constant uuid := '00000000-0000-0000-0000-00000000f102';
  v_inactive_service_id constant uuid := '00000000-0000-0000-0000-00000000f103';
  v_active_count integer;
  v_inactive_count integer;
BEGIN
  INSERT INTO public.businesses (id, slug, name, timezone, capacity)
  VALUES (v_business_id, 'orvel-smoke-public-services-rls', 'Orvel Smoke Public Services RLS', 'UTC', 1);

  INSERT INTO public.services (id, business_id, name, duration_minutes, price, is_active)
  VALUES
    (v_active_service_id, v_business_id, 'Smoke Active Service', 30, 1000, true),
    (v_inactive_service_id, v_business_id, 'Smoke Inactive Service', 30, 1000, false);
END $$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', true);

DO $$
DECLARE
  v_active_service_id constant uuid := '00000000-0000-0000-0000-00000000f102';
  v_inactive_service_id constant uuid := '00000000-0000-0000-0000-00000000f103';
  v_active_count integer;
  v_inactive_count integer;
BEGIN
  SELECT count(*) INTO v_active_count
  FROM public.services
  WHERE id = v_active_service_id;

  SELECT count(*) INTO v_inactive_count
  FROM public.services
  WHERE id = v_inactive_service_id;

  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'Expected anon to read active public service, got % rows', v_active_count;
  END IF;

  IF v_inactive_count <> 0 THEN
    RAISE EXCEPTION 'Expected anon to be unable to read inactive public service, got % rows', v_inactive_count;
  END IF;
END $$;

SELECT 'public_services_rls_smoke' AS check_name, 'PASS' AS result;

ROLLBACK;
