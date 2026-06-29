-- Forward-only public booking operational telemetry sink.
-- Stores only sanitized, allowlisted failure metadata from anonymous public booking flows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.public_booking_failure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  feature text NOT NULL DEFAULT 'public-booking' CHECK (feature = 'public-booking'),
  stage text NOT NULL CHECK (stage IN ('resolver', 'service', 'availability', 'submit')),
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_:-]{1,64}$'),
  status integer CHECK (status BETWEEN 100 AND 599),
  retryable boolean NOT NULL DEFAULT true
);

ALTER TABLE public.public_booking_failure_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_booking_failure_events FROM PUBLIC;
REVOKE ALL ON TABLE public.public_booking_failure_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_public_booking_failure(
  p_stage text,
  p_code text,
  p_status integer DEFAULT NULL,
  p_retryable boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage text;
  v_code text;
  v_status integer;
BEGIN
  v_stage := lower(nullif(btrim(p_stage), ''));
  IF v_stage NOT IN ('resolver', 'service', 'availability', 'submit') THEN
    v_stage := 'submit';
  END IF;

  v_code := left(regexp_replace(upper(coalesce(nullif(btrim(p_code), ''), 'UNKNOWN')), '[^A-Z0-9_:-]', '_', 'g'), 64);
  IF v_code = '' THEN
    v_code := 'UNKNOWN';
  END IF;

  IF p_status BETWEEN 100 AND 599 THEN
    v_status := p_status;
  ELSE
    v_status := NULL;
  END IF;

  INSERT INTO public.public_booking_failure_events (stage, code, status, retryable)
  VALUES (v_stage, v_code, v_status, coalesce(p_retryable, true));
END;
$$;

REVOKE ALL ON FUNCTION public.record_public_booking_failure(text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_public_booking_failure(text, text, integer, boolean) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
