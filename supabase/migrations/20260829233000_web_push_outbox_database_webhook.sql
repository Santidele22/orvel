-- Clone the existing process-email-outbox database webhook onto web_push_outbox.
-- Secrets stay in the database trigger args; they are not copied into git.

BEGIN;

DO $$
DECLARE
  def text;
  fn_url text;
  headers text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'process-web-push-outbox') THEN
    RETURN;
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO def
  FROM pg_trigger t
  WHERE t.tgname = 'process-email-outbox'
  LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'process-email-outbox webhook missing; cannot clone web push webhook';
  END IF;

  fn_url := replace(
    (regexp_match(def, 'http_request\(''([^'']+)'''))[1],
    'process-email-outbox',
    'process-web-push-outbox'
  );
  headers := (regexp_match(def, '''POST'', ''(\{.*?\})'', ''\{\}'''))[1];

  IF fn_url IS NULL OR headers IS NULL OR position('process-web-push-outbox' in fn_url) = 0 THEN
    RAISE EXCEPTION 'failed to clone process-email-outbox webhook for web push';
  END IF;

  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT ON public.web_push_outbox FOR EACH ROW WHEN (NEW.status = %L) EXECUTE FUNCTION supabase_functions.http_request(%L, %L, %L, %L, %L)',
    'process-web-push-outbox',
    'pending',
    fn_url,
    'POST',
    headers,
    '{}',
    '5000'
  );
END
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
