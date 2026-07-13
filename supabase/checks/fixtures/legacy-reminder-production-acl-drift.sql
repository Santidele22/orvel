-- Sanitized production-shape fixture. It intentionally contains no customer,
-- project, recipient, URL, role-member, or provider identity.
GRANT USAGE, CREATE ON SCHEMA public TO drift_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE drift_owner IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

ALTER FUNCTION public.reserve_trial_user_activation_reminder_attempt() OWNER TO drift_owner;
ALTER FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) OWNER TO drift_owner;

GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_mutation() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_one_time_email_attempt_delete() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_trial_user_activation_reminder_attempt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_trial_user_activation_reminder_attempt(text) TO anon, authenticated, service_role;
