-- Expose deposit_status on admin booking list so the dashboard can show pending seña.

BEGIN;

DROP FUNCTION IF EXISTS public.list_admin_bookings(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.list_admin_bookings(
  p_branch_id uuid,
  p_starts_at timestamptz DEFAULT NULL,
  p_ends_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  business_id uuid,
  branch_id uuid,
  service_id text,
  customer_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  notes text,
  source text,
  created_at timestamptz,
  updated_at timestamptz,
  professional_id text,
  professional_name text,
  deposit_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF p_branch_id IS NULL THEN
    PERFORM public._raise_rpc('BRANCH_REQUIRED');
  END IF;

  SELECT br.business_id
    INTO v_business_id
  FROM public.branches br
  WHERE br.id = p_branch_id
    AND br.is_active IS TRUE
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BRANCH_NOT_FOUND');
  END IF;

  IF NOT public.can_manage_business(v_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN QUERY
  SELECT
    bk.id,
    bk.business_id,
    bk.branch_id,
    bk.service_id::text,
    bk.customer_id,
    bk.starts_at,
    bk.ends_at,
    bk.status,
    bk.notes,
    bk.source,
    bk.created_at,
    bk.updated_at,
    bk.professional_id,
    p.name,
    COALESCE(bk.deposit_status, 'none')
  FROM public.bookings bk
  LEFT JOIN public.professionals p
    ON p.id::text = bk.professional_id
   AND p.business_id = bk.business_id
  WHERE bk.business_id = v_business_id
    AND bk.branch_id = p_branch_id
    AND (p_starts_at IS NULL OR bk.ends_at > p_starts_at)
    AND (p_ends_at IS NULL OR bk.starts_at < p_ends_at)
  ORDER BY bk.starts_at ASC, bk.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) IS '@orvel-contract admin_booking_list';

REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_admin_bookings(uuid, timestamptz, timestamptz) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
