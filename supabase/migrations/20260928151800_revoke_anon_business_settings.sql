-- Revoke the remaining anonymous read on public.business_settings.
--
-- Audit: docs/audits/2026-09-28-dev-code-audit.md (C-2, verified in runtime
-- against pre-release and production on 2026-09-28). The legacy
-- "Public view settings" USING (true) SELECT policy exposed the deposit
-- alias/CBU, the support phone and the whatsapp of every tenant to the
-- anonymous key.
--
-- Phase 1 (20260928150000_harden_public_tenant_reads.sql) closed businesses,
-- branches and the entitlements overload. This is the contract half for
-- business_settings: it can land now because the client change that stopped the
-- anonymous gateway reading this table is already deployed in dev and qa
-- (PR #1057 / #1058). Revoking before that bundle was live would have left
-- cached PWA clients failing their `select('*')` and falling back to default
-- working hours.
--
-- What keeps working:
--   * the dashboard reads through the authenticated owner policy
--     "Owners manage settings" (public.is_business_owner(business_id));
--   * the public turnero resolves identity, booking policy and operational
--     settings (including the deposit receipt data) through the SECURITY DEFINER
--     RPC public.resolve_business_by_slug(text). Every anon-reachable function
--     that reads this table is SECURITY DEFINER, so none of them depends on the
--     caller's table grants.
--
-- Production (main) still needs the qa -> main promotion before this applies
-- there.

BEGIN;

DROP POLICY IF EXISTS "Public view settings" ON public.business_settings;
REVOKE ALL ON TABLE public.business_settings FROM anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
