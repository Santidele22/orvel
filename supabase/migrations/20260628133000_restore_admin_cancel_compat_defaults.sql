-- Forward-only restoration of old optional-argument defaults for cached
-- dashboard clients calling the legacy 4-arg admin cancel RPC signature.

BEGIN;
CREATE OR REPLACE FUNCTION public.cancel_admin_booking(
  booking_id uuid,
  performed_by uuid DEFAULT NULL,
  notes text DEFAULT NULL,
  reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.record_admin_booking_cancel_failure(
    'rpc',
    'CLIENT_UPGRADE_REQUIRED',
    409,
    false
  );

  PERFORM public._raise_rpc('CLIENT_UPGRADE_REQUIRED');

  RETURN jsonb_build_object(
    'booking_id', booking_id,
    'status', 'client_upgrade_required',
    'reason', reason,
    'performed_by', performed_by,
    'notes', notes
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_admin_booking(uuid, uuid, text, text) TO authenticated, service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
