-- Recoverable paid signup handoff before Mercado Pago starts.
-- The browser receives only an opaque reference and an HttpOnly binding cookie.
BEGIN;

ALTER TABLE public.pending_signup_intents
  ADD COLUMN IF NOT EXISTS handoff_reference text UNIQUE,
  ADD COLUMN IF NOT EXISTS handoff_binding_hash text,
  ADD COLUMN IF NOT EXISTS handoff_created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS pending_signup_intents_handoff_reference_idx
  ON public.pending_signup_intents(handoff_reference)
  WHERE handoff_reference IS NOT NULL;

COMMIT;
