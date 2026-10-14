-- Security hardening: close function ACL gaps found in the 2026-10-14 audit.
--
-- Issues:
--   #1162 (critical) release_expired_booking_hold(uuid, uuid) kept a GRANT to
--          anon/authenticated from 20260904120000_manual_booking_deposits.sql,
--          letting any anonymous turnero visitor sweep and mutate deposit hold
--          state across every tenant via PostgREST.
--   #1163 (high) _read_business_booking_config(uuid) never got an explicit
--          REVOKE, so PostgreSQL's default EXECUTE TO PUBLIC exposed every
--          business's settings (including historical deposit alias/CBU).
--   #1164 (high) get_business_entitlements_snapshot(text, text) -- the
--          overload PostgREST resolves for the dashboard -- lacked the
--          owner/service_role guard that the (uuid, uuid) overload has.
--   #1169 (medium) SECURITY DEFINER trigger helpers without an explicit
--          REVOKE are executable via PostgREST by default; one of them
--          (request_web_push_outbox_processing) reads vault.decrypted_secrets
--          and performs outbound HTTP with the service role key.
--
-- Trigger helpers keep working after the revoke: PostgreSQL does not check
-- EXECUTE privileges when a trigger fires, and no Edge Function calls these
-- four via RPC (verified in-repo on 2026-10-14).

BEGIN;

-- #1162: the legitimate caller is the release-expired-booking-holds Edge
-- Function, which authenticates with the service role key.
REVOKE EXECUTE ON FUNCTION public.release_expired_booking_hold(uuid, uuid) FROM anon, authenticated;

-- #1163: internal helper; every in-repo caller is SECURITY DEFINER and runs
-- as the function owner, so no caller needs a grant. service_role keeps it
-- for operational/debug access.
REVOKE ALL ON FUNCTION public._read_business_booking_config(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._read_business_booking_config(uuid) TO service_role;

-- #1164: recreate the (text, text) overload with the same authorization guard
-- as the (uuid, uuid) overload from
-- 20260928210000_decouple_signup_and_entitlements_from_mp.sql. Parameter names
-- stay business_id/tenant_id because the dashboard calls them by name through
-- PostgREST. Query body is unchanged; only the guard and the LANGUAGE
-- (plpgsql, needed for the guard) change.
CREATE OR REPLACE FUNCTION public.get_business_entitlements_snapshot(business_id text, tenant_id text)
RETURNS SETOF public.business_entitlements_snapshot
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_business_owner($1::uuid)) THEN
    RAISE EXCEPTION 'forbidden entitlement snapshot for business %', $1 USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  select
    bs.business_id::text,
    $2::text,
    coalesce(pa.plan_code, upper(btrim(bs.plan))),
    'active'::text,
    pe.max_locales,
    pe.max_rubros,
    pe.max_monthly_bookings,
    pe.ai_credits_monthly
  from public.business_settings bs
  join public.businesses b
    on b.id = bs.business_id
  left join public.business_onboarding_state bos
    on bos.business_id = bs.business_id
  left join public.plan_aliases pa
    on pa.alias = upper(btrim(bs.plan))
  join public.plan_entitlements pe
    on pe.plan_code = coalesce(pa.plan_code, upper(btrim(bs.plan)))
  where bs.business_id::text = $1
    and coalesce(bos.account_user_id, b.owner_id)::text = $2
  limit 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(text, text) TO authenticated, service_role;

-- #1169: trigger-only SECURITY DEFINER helpers must not be RPC-callable.
REVOKE ALL ON FUNCTION public.request_web_push_outbox_processing() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_business_principal_branch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_booking_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_web_push_outbox() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
