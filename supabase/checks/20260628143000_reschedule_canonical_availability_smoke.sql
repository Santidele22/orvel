-- Rollback smoke for 20260628143000_enforce_reschedule_canonical_availability.sql.
-- Run after pushing the migration with:
--   npx supabase@latest db query --linked < supabase/checks/20260628143000_reschedule_canonical_availability_smoke.sql
-- Expected final row: reschedule_canonical_availability_smoke | PASS
-- The transaction is always rolled back; do not replace these disposable IDs with real customer data.

BEGIN;

DO $$
DECLARE
  v_business_id constant uuid := '00000000-0000-0000-0000-00000000e2e0';
  v_branch_id constant uuid := '00000000-0000-0000-0000-00000000e2ec';
  v_other_branch_id constant uuid := '00000000-0000-0000-0000-00000000e2ed';
  v_admin_user_id constant uuid := '00000000-0000-0000-0000-00000000e2ee';
  v_service_id constant uuid := '00000000-0000-0000-0000-00000000e2e1';
  v_customer_id constant uuid := '00000000-0000-0000-0000-00000000e2e2';
  v_success_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e3';
  v_expired_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e4';
  v_cancelled_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e5';
  v_conflict_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e6';
  v_occupied_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e7';
  v_admin_success_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e8';
  v_admin_terminal_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2e9';
  v_admin_conflict_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2ea';
  v_admin_occupied_booking_id constant uuid := '00000000-0000-0000-0000-00000000e2eb';
  v_token_success constant text := 'orvel-smoke-success-token';
  v_token_expired constant text := 'orvel-smoke-expired-token';
  v_token_cancelled constant text := 'orvel-smoke-cancelled-token';
  v_token_conflict constant text := 'orvel-smoke-conflict-token';
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  INSERT INTO public.businesses (id, slug, name, timezone, capacity)
  VALUES (v_business_id, 'orvel-smoke-reschedule-canonical', 'Orvel Smoke Reschedule Canonical', 'UTC', 1);

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (
    v_admin_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'orvel-smoke-admin@example.invalid',
    crypt('orvel-smoke-password', gen_salt('bf')),
    now(),
    now(),
    now()
  );

  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_business_id, v_admin_user_id, 'owner');

  INSERT INTO public.business_settings (
    business_id,
    business_name,
    slug,
    buffer_minutes,
    min_notice_minutes,
    slot_interval_minutes,
    cancellation_window_minutes,
    allow_client_cancel,
    allow_client_reschedule,
    capacity,
    working_hours
  ) VALUES (
    v_business_id,
    'Orvel Smoke Reschedule Canonical',
    'orvel-smoke-reschedule-canonical',
    0,
    0,
    60,
    60,
    true,
    true,
    1,
    '{
      "monday":{"enabled":true,"start":"09:00","end":"17:00"},
      "tuesday":{"enabled":true,"start":"09:00","end":"17:00"},
      "wednesday":{"enabled":true,"start":"09:00","end":"17:00"},
      "thursday":{"enabled":true,"start":"09:00","end":"17:00"},
      "friday":{"enabled":true,"start":"09:00","end":"17:00"},
      "saturday":{"enabled":true,"start":"09:00","end":"17:00"},
      "sunday":{"enabled":true,"start":"09:00","end":"17:00"}
    }'::jsonb
  );

  INSERT INTO public.branches (id, business_id, name, slug, timezone, is_active)
  VALUES
    (v_branch_id, v_business_id, 'Smoke Branch', 'smoke-branch', 'UTC', true),
    (v_other_branch_id, v_business_id, 'Other Smoke Branch', 'other-smoke-branch', 'UTC', true);

  INSERT INTO public.services (id, business_id, name, duration_minutes, price, is_active)
  VALUES (v_service_id, v_business_id, 'Smoke Service', 60, 0, true);

  INSERT INTO public.customers (id, business_id, full_name, email, phone)
  VALUES (v_customer_id, v_business_id, 'Rollback Smoke', 'rollback-smoke@example.invalid', '000');

  INSERT INTO public.bookings (id, business_id, branch_id, customer_id, service_id, starts_at, ends_at, status, manage_token_hash, manage_token_expires_at, source)
  VALUES
    (v_success_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z', 'confirmed', public._hash_manage_token(v_token_success), '2099-01-05T11:00:00Z', 'client-self-service'),
    (v_expired_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-06T10:00:00Z', '2099-01-06T11:00:00Z', 'confirmed', public._hash_manage_token(v_token_expired), now() - interval '1 minute', 'client-self-service'),
    (v_cancelled_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-07T10:00:00Z', '2099-01-07T11:00:00Z', 'cancelled', public._hash_manage_token(v_token_cancelled), '2099-01-07T11:00:00Z', 'client-self-service'),
    (v_conflict_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-08T10:00:00Z', '2099-01-08T11:00:00Z', 'confirmed', public._hash_manage_token(v_token_conflict), '2099-01-08T11:00:00Z', 'client-self-service'),
    (v_occupied_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-08T12:00:00Z', '2099-01-08T13:00:00Z', 'confirmed', public._hash_manage_token('orvel-smoke-occupied-token'), '2099-01-08T13:00:00Z', 'client-self-service'),
    (v_admin_success_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-09T10:00:00Z', '2099-01-09T11:00:00Z', 'confirmed', public._hash_manage_token('orvel-smoke-admin-success-token'), '2099-01-09T11:00:00Z', 'admin-manual'),
    (v_admin_terminal_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-10T10:00:00Z', '2099-01-10T11:00:00Z', 'completed', public._hash_manage_token('orvel-smoke-admin-terminal-token'), '2099-01-10T11:00:00Z', 'admin-manual'),
    (v_admin_conflict_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-11T10:00:00Z', '2099-01-11T11:00:00Z', 'confirmed', public._hash_manage_token('orvel-smoke-admin-conflict-token'), '2099-01-11T11:00:00Z', 'admin-manual'),
    (v_admin_occupied_booking_id, v_business_id, v_branch_id, v_customer_id, v_service_id, '2099-01-11T12:00:00Z', '2099-01-11T13:00:00Z', 'confirmed', public._hash_manage_token('orvel-smoke-admin-occupied-token'), '2099-01-11T13:00:00Z', 'admin-manual');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_user_id::text, true);

  BEGIN
    PERFORM public.reschedule_admin_booking(
      booking_id => v_admin_success_booking_id,
      starts_at_iso => '2099-01-09T13:00:00Z',
      performed_by => NULL::uuid,
      notes => NULL,
      reason => 'smoke-auth-business-authorized-branchless'
    );
    RAISE EXCEPTION 'Expected ACTIVE_BRANCH_REQUIRED for business-authorized branchless admin reschedule';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ACTIVE_BRANCH_REQUIRED' THEN
      RAISE EXCEPTION 'Expected ACTIVE_BRANCH_REQUIRED for business-authorized branchless admin reschedule, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.reschedule_admin_booking(
      booking_id => v_admin_success_booking_id,
      starts_at_iso => '2099-01-09T13:00:00Z',
      branch_id => v_other_branch_id,
      performed_by => NULL::uuid,
      notes => NULL,
      reason => 'smoke-auth-business-authorized-stale-branch'
    );
    RAISE EXCEPTION 'Expected UNAUTHORIZED for business-authorized stale-branch admin reschedule';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'UNAUTHORIZED' THEN
      RAISE EXCEPTION 'Expected UNAUTHORIZED for business-authorized stale-branch admin reschedule, got %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  BEGIN
    PERFORM public.manage_booking_by_token(v_token_expired, '1900-01-01T00:00:00Z');
    RAISE EXCEPTION 'Expected TOKEN_EXPIRED when caller now_iso tries to move server time into the past';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TOKEN_EXPIRED' THEN
      RAISE EXCEPTION 'Expected TOKEN_EXPIRED, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.reschedule_booking_by_token(v_token_cancelled, '1900-01-01T00:00:00Z', '2099-01-07T12:00:00Z');
    RAISE EXCEPTION 'Expected BOOKING_ALREADY_CANCELLED for cancelled booking';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'BOOKING_ALREADY_CANCELLED' THEN
      RAISE EXCEPTION 'Expected BOOKING_ALREADY_CANCELLED, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.reschedule_booking_by_token(v_token_conflict, '1900-01-01T00:00:00Z', '2099-01-08T12:00:00Z');
    RAISE EXCEPTION 'Expected SLOT_CONFLICT for slot absent from canonical availability';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SLOT_CONFLICT' THEN
      RAISE EXCEPTION 'Expected SLOT_CONFLICT, got %', SQLERRM;
    END IF;
  END;

  v_result := public.reschedule_booking_by_token(v_token_success, '1900-01-01T00:00:00Z', '2099-01-05T13:00:00Z');

  IF v_result->>'booking_id' <> v_success_booking_id::text THEN
    RAISE EXCEPTION 'Expected successful reschedule for %, got %', v_success_booking_id, v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.id = v_success_booking_id
      AND bk.starts_at = '2099-01-05T13:00:00Z'::timestamptz
      AND bk.ends_at = '2099-01-05T14:00:00Z'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Expected success booking mutation to target canonical slot';
  END IF;

  BEGIN
    PERFORM public.reschedule_admin_booking(
      booking_id => v_admin_conflict_booking_id,
      starts_at_iso => '2099-01-11T12:00:00Z',
      branch_id => v_branch_id,
      performed_by => NULL::uuid,
      notes => NULL,
      reason => 'smoke-conflict'
    );
    RAISE EXCEPTION 'Expected SLOT_CONFLICT for admin slot absent from canonical availability';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SLOT_CONFLICT' THEN
      RAISE EXCEPTION 'Expected admin SLOT_CONFLICT, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    PERFORM public.reschedule_admin_booking(
      booking_id => v_admin_terminal_booking_id,
      starts_at_iso => '2099-01-10T12:00:00Z',
      branch_id => v_branch_id,
      performed_by => NULL::uuid,
      notes => NULL,
      reason => 'smoke-terminal'
    );
    RAISE EXCEPTION 'Expected TURNO_INVALID_STATUS_TRANSITION for admin terminal booking';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TURNO_INVALID_STATUS_TRANSITION' THEN
      RAISE EXCEPTION 'Expected admin TURNO_INVALID_STATUS_TRANSITION, got %', SQLERRM;
    END IF;
  END;

  v_result := public.reschedule_admin_booking(
    booking_id => v_admin_success_booking_id,
    starts_at_iso => '2099-01-09T13:00:00Z',
    branch_id => v_branch_id,
    performed_by => NULL::uuid,
    notes => NULL,
    reason => 'smoke-success'
  );

  IF v_result->>'booking_id' <> v_admin_success_booking_id::text THEN
    RAISE EXCEPTION 'Expected successful admin reschedule for %, got %', v_admin_success_booking_id, v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.id = v_admin_success_booking_id
      AND bk.starts_at = '2099-01-09T13:00:00Z'::timestamptz
      AND bk.ends_at = '2099-01-09T14:00:00Z'::timestamptz
  ) THEN
    RAISE EXCEPTION 'Expected admin success booking mutation to target canonical slot';
  END IF;
END $$;

SELECT 'reschedule_canonical_availability_smoke' AS check_name, 'PASS' AS result;

ROLLBACK;
