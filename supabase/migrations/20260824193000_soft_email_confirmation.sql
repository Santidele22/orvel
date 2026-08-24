-- Product-level email confirmation flag. Distinct from auth.users.email_confirmed_at.

BEGIN;

ALTER TABLE public.business_onboarding_state
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;

COMMENT ON COLUMN public.business_onboarding_state.email_confirmed_at IS
  'Set when the operator confirms the signup email. NULL means unconfirmed. Does not block dashboard access.';

COMMIT;
