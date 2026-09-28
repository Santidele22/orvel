-- Contract step for the public services catalogue.
--
-- Migrations run against the database independently of the frontend deploy, so
-- this is deliberately a **separate** migration from
-- `20260928190000_public_services_via_rpc.sql`:
--
--   1. expand  (20260928190000): create `list_public_services`. Old clients keep
--      reading the table, new clients read the RPC — both work.
--   2. contract (this file): drop the anonymous SELECT policy and revoke table
--      access. Only safe once the client that calls the RPC is deployed;
--      applying it first would break the public turnero for the interval
--      between the database migration and the frontend deploy.
--
-- After this runs, an anonymous caller can no longer enumerate other tenants'
-- catalogue: `services` is reachable only through the RPC, which requires naming
-- the business and returns active rows only for non-managers.

BEGIN;

DROP POLICY IF EXISTS "Public view active services" ON public.services;
REVOKE ALL ON TABLE public.services FROM anon;

COMMIT;
NOTIFY pgrst, 'reload schema';
