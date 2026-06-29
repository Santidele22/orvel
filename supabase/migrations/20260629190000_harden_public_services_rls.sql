-- Harden direct public reads of services while preserving authenticated business management.

DROP POLICY IF EXISTS "Public view services" ON public.services;
DROP POLICY IF EXISTS "Public view active services" ON public.services;
DROP POLICY IF EXISTS "Business managers manage services" ON public.services;

CREATE POLICY "Public view active services"
  ON public.services
  FOR SELECT
  TO anon, authenticated
  USING (COALESCE(is_active, true) = true);

CREATE POLICY "Business managers manage services"
  ON public.services
  FOR ALL
  TO authenticated
  USING (public.can_manage_business(business_id))
  WITH CHECK (public.can_manage_business(business_id));

COMMENT ON POLICY "Public view active services" ON public.services IS
  'Public booking clients may only read active services directly; inactive services remain hidden by RLS.';

COMMENT ON POLICY "Business managers manage services" ON public.services IS
  'Authenticated owners and business_members retain full service CRUD through can_manage_business().';
