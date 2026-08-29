-- Records the live orvel-prod expire_signup_email_confirmation body:
-- expire ALL pending unused rows for hmac+purpose on retry (no TTL filter).

CREATE OR REPLACE FUNCTION public.expire_signup_email_confirmation(
  p_email_hmac text,
  p_purpose text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'expire_signup_email_confirmation is service-role only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.signup_email_confirmations
  SET status = 'expired', updated_at = now()
  WHERE email_hmac = p_email_hmac
    AND purpose = p_purpose
    AND status = 'pending'
    AND consumed_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_signup_email_confirmation(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_signup_email_confirmation(text, text) TO service_role;
