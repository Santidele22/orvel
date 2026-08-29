-- Publish dashboard_notifications to supabase_realtime so the operator PWA
-- can pulse on postgres_changes without selecting bookings.

BEGIN;

ALTER TABLE public.dashboard_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dashboard_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_notifications;
  END IF;
END
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
