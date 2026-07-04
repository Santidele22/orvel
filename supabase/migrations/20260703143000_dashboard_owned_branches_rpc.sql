-- Backend-owned dashboard branch context.
-- Dashboard clients must not prove business ownership by reading public tables.

CREATE OR REPLACE FUNCTION public.get_dashboard_branches()
RETURNS TABLE (
  id uuid,
  name text,
  business_id uuid,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    br.id,
    COALESCE(NULLIF(btrim(br.name), ''), 'Sucursal') AS name,
    br.business_id,
    br.is_active
  FROM public.branches br
  JOIN public.businesses b ON b.id = br.business_id
  WHERE b.owner_id = (SELECT auth.uid())
    AND (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(br.is_active, true) = true
  ORDER BY name ASC, br.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_branches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_branches() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dashboard_branches() IS
  'Returns active dashboard branches only for businesses owned by auth.uid(); public booking reads remain separate.';
