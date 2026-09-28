-- Harden the anonymous read surface of tenant tables.
--
-- Audit: docs/audits/2026-09-28-dev-code-audit.md (verified in runtime against
-- pre-release and production on 2026-09-28).
--
--   C-2  The legacy `USING (true)` SELECT policies created in
--        20260501_consolidated_schema.sql let `anon` enumerate every tenant
--        (`businesses.owner_id`, the key `get_business_entitlements_snapshot`
--        needs) and read every tenant's settings row.
--   A-14 `public.get_business_entitlements_snapshot(text, text)` is
--        SECURITY DEFINER and keeps the default EXECUTE grant to PUBLIC: every
--        REVOKE in the tree targeted the `(uuid, uuid)` signature instead, so
--        `anon` could read any tenant's plan and limits.
--   M-15 `services` and `branches` were world-readable for every tenant.
--
-- Scope note: `business_settings` and `services` are NOT revoked here on
-- purpose. The public booking route still reads them directly with the
-- anonymous client:
--   * packages/booking/src/infrastructure/supabase/real-gateway.ts:146-150
--     (`select('*')` on business_settings) while `resolve_business_by_slug()`
--     already returns the same `settings`/`booking_policy` payload;
--   * apps/dashboard/src/app/features/booking/pages/public/public-booking.page.ts:449
--     -> ServicioService.getByBusinessId -> `select('*')` on services.
-- Revoking those two tables requires the client to stop using `select('*')`
-- and to read through the SECURITY DEFINER resolvers first (expand/contract).
--
-- Public booking keeps working after this migration: resolve_business_by_slug(),
-- query_public_slot_availability(), list_public_professionals_for_service(),
-- create_public_booking() and the token RPCs are all SECURITY DEFINER with a
-- pinned `search_path`, so they do not depend on the caller's table grants. The
-- dashboard reads through the authenticated owner policies, which are untouched.

BEGIN;

-- 1) businesses: drop the legacy public SELECT policy and the anonymous grants.
--    The public turnero resolves the business through resolve_business_by_slug().
DROP POLICY IF EXISTS "Public view businesses" ON public.businesses;
REVOKE ALL ON TABLE public.businesses FROM anon;

-- 2) branches: same. No anonymous consumer exists in the repository; the
--    dashboard uses get_dashboard_branches(uuid), granted to authenticated.
DROP POLICY IF EXISTS "Public view active branches" ON public.branches;
REVOKE ALL ON TABLE public.branches FROM anon;

-- 3) entitlements snapshot: the `(text, text)` overload is the signature the
--    dashboard calls (features/billing/data-access/subscriptions/entitlements.api.ts:47),
--    so authenticated keeps EXECUTE; anon/PUBLIC lose it.
REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(text, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
