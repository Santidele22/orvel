-- Forward-only repair for production PostgREST EXECUTE privileges on the
-- dashboard branch context RPC. Keep both overloads available because current
-- dashboard code calls get_dashboard_branches(p_business_id), while the no-arg
-- overload remains a compatibility wrapper for older clients.

CREATE OR REPLACE FUNCTION public.get_dashboard_branches(p_business_id uuid)
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
  WHERE p_business_id IS NOT NULL
    AND br.business_id = p_business_id
    AND (
      auth.role() = 'service_role'
      OR public.can_manage_business(br.business_id)
    )
    AND COALESCE(br.is_active, true) = true
  ORDER BY name ASC, br.created_at ASC;
$$;

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
  WHERE (
      auth.role() = 'service_role'
      OR public.can_manage_business(br.business_id)
    )
    AND COALESCE(br.is_active, true) = true
  ORDER BY name ASC, br.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_branches(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_branches() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_dashboard_branches(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_branches() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dashboard_branches(uuid) IS
  'Returns active dashboard branches for the requested business when auth.uid() can manage that business through owner or business_members.';

COMMENT ON FUNCTION public.get_dashboard_branches() IS
  'Backwards-compatible wrapper returning active dashboard branches across all businesses manageable by auth.uid(); dashboard callers should prefer get_dashboard_branches(uuid).';

NOTIFY pgrst, 'reload schema';
