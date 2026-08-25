BEGIN;

CREATE TABLE IF NOT EXISTS public.web_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.dashboard_notifications (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (notification_id)
);

CREATE INDEX IF NOT EXISTS web_push_outbox_pending_idx
  ON public.web_push_outbox (created_at)
  WHERE status = 'pending';

ALTER TABLE public.web_push_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY web_push_outbox_service_role
  ON public.web_push_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.web_push_outbox TO service_role;
REVOKE ALL ON TABLE public.web_push_outbox FROM authenticated, anon;
GRANT SELECT, DELETE ON TABLE public.web_push_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_web_push_outbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IN (
    'appointment.created',
    'appointment.cancelled',
    'appointment.rescheduled'
  ) THEN
    INSERT INTO public.web_push_outbox (
      business_id,
      notification_id,
      event_type,
      title,
      body,
      status
    ) VALUES (
      NEW.business_id,
      NEW.id,
      NEW.event_type,
      NEW.title,
      NEW.body,
      'pending'
    )
    ON CONFLICT (notification_id) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_web_push_outbox ON public.dashboard_notifications;
CREATE TRIGGER trg_enqueue_web_push_outbox
  AFTER INSERT ON public.dashboard_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_web_push_outbox();

COMMIT;
