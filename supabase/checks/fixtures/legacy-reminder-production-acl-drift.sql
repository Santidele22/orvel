-- Sanitized production-shape fixture. It intentionally contains no customer,
-- project, recipient, URL, role-member, or provider identity.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_mutation() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) TO anon, authenticated, service_role;
