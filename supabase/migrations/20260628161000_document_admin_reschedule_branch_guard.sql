-- Forward-only documentation of admin reschedule authorization semantics.
-- Authorization remains business-level through can_manage_business(). The
-- branch_id argument is a stale-context/target consistency guard for dashboard
-- clients; it is not a branch-level permission boundary.

BEGIN;

COMMENT ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, uuid, text, text)
IS 'Admin booking reschedule. Authenticated callers are authorized at business level via can_manage_business(); branch_id is required only as a stale-context/target consistency guard and is not a branch-level permission boundary.';

COMMENT ON FUNCTION public.reschedule_admin_booking(uuid, text, uuid, text, text)
IS 'Service-role compatibility overload. Authenticated dashboard callers must use the branch_id overload; authorization remains business-level, not branch-level.';

COMMENT ON FUNCTION public.reschedule_admin_booking(uuid, text, text, text, text)
IS 'Service-role compatibility overload. Authenticated dashboard callers must use the branch_id overload; authorization remains business-level, not branch-level.';

COMMIT;
NOTIFY pgrst, 'reload schema';
