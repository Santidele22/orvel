-- Forward-only hardening for booking reschedule helper/admin RPC execute grants.
-- The token helper returns public.bookings and must not be directly executable
-- by public clients; public token management stays available only through the
-- intended manage/cancel/reschedule RPCs.

BEGIN;
REVOKE ALL ON FUNCTION public._load_manageable_booking(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._load_manageable_booking(text, timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_booking_by_token(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_booking_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_by_token(text, text) TO anon, authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
