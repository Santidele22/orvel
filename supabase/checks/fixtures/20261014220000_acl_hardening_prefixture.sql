-- Fixture: minimal pre-fix state for 20261014220000_harden_security_definer_function_acl.sql
-- Simulates the objects the migration touches, with the vulnerable ACLs in place.

-- Roles exist in the supabase/postgres image but not in a vanilla postgres one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT current_setting('test.role', true) $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;

CREATE TABLE public.businesses (id uuid PRIMARY KEY, owner_id uuid);
CREATE TABLE public.business_settings (business_id uuid REFERENCES public.businesses(id), plan text);
CREATE TABLE public.business_onboarding_state (business_id uuid, account_user_id uuid);
CREATE TABLE public.plan_aliases (alias text, plan_code text);
CREATE TABLE public.plan_entitlements (
  plan_code text, max_locales integer, max_rubros integer,
  max_monthly_bookings integer, ai_credits_monthly integer
);

CREATE TYPE public.business_entitlements_snapshot AS (
  business_id text, tenant_id text, plan_code text, subscription_status text,
  max_locales integer, max_rubros integer, max_monthly_bookings integer, ai_credits_monthly integer
);

-- Owner is a fixed well-known uid for the fixture.
CREATE FUNCTION public.is_business_owner(uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT current_setting('test.uid', true) = '11111111-1111-1111-1111-111111111111' $$;

-- #1162 pre-fix state: granted to everyone, no caller check.
CREATE FUNCTION public.release_expired_booking_hold(uuid DEFAULT NULL, uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN END $$;
GRANT EXECUTE ON FUNCTION public.release_expired_booking_hold(uuid, uuid) TO anon, authenticated, service_role;

-- #1163 pre-fix state: no explicit REVOKE, so PUBLIC can execute (PG default).
CREATE FUNCTION public._read_business_booking_config(uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT '{}'::jsonb $$;

-- #1164 pre-fix state: original unguarded (text, text) overload.
CREATE FUNCTION public.get_business_entitlements_snapshot(business_id text, tenant_id text)
RETURNS SETOF public.business_entitlements_snapshot
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
  join public.businesses b on b.id = bs.business_id
  left join public.business_onboarding_state bos on bos.business_id = bs.business_id
  left join public.plan_aliases pa on pa.alias = upper(btrim(bs.plan))
  join public.plan_entitlements pe on pe.plan_code = coalesce(pa.plan_code, upper(btrim(bs.plan)))
  where bs.business_id::text = $1
    and coalesce(bos.account_user_id, b.owner_id)::text = $2
  limit 1;
$$;
REVOKE ALL ON FUNCTION public.get_business_entitlements_snapshot(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_entitlements_snapshot(text, text) TO authenticated, service_role;

-- #1169 pre-fix state: trigger helpers with default PUBLIC grant.
CREATE FUNCTION public.request_web_push_outbox_processing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NULL; END $$;
CREATE FUNCTION public.ensure_business_principal_branch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NULL; END $$;
CREATE FUNCTION public.handle_booking_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NULL; END $$;
CREATE FUNCTION public.enqueue_web_push_outbox() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN RETURN NULL; END $$;

-- Fixture data: one business owned by the well-known uid.
INSERT INTO public.businesses VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.business_settings VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FREE');
INSERT INTO public.plan_entitlements VALUES ('FREE', 1, 1, 100, 0);
