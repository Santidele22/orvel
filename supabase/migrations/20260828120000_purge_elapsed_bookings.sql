-- Recurring hard-delete of elapsed bookings. Elapsed means ends_at <= now() (timestamptz instant).
-- Invoke via the purge-elapsed-bookings Edge Function with an external scheduler POST.

BEGIN;

CREATE OR REPLACE FUNCTION public.purge_elapsed_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'purge_elapsed_bookings is service-role only'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.bookings
  WHERE ends_at <= now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_elapsed_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_elapsed_bookings() FROM anon;
REVOKE ALL ON FUNCTION public.purge_elapsed_bookings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_elapsed_bookings() TO service_role;

COMMIT;
