-- Harden public.bookings against direct client writes/reads.
-- Public booking creation must go through the validated SECURITY DEFINER RPCs.

BEGIN;

DROP POLICY IF EXISTS "Public create bookings" ON public.bookings;

REVOKE ALL ON TABLE public.bookings FROM PUBLIC;
REVOKE ALL ON TABLE public.bookings FROM anon;
REVOKE ALL ON TABLE public.bookings FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking(text, text, text, jsonb, text, text, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
