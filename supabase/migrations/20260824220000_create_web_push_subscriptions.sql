BEGIN;

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY web_push_subscriptions_owner_insert
  ON public.web_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_business_owner(business_id));

CREATE POLICY web_push_subscriptions_owner_select
  ON public.web_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_business_owner(business_id));

CREATE POLICY web_push_subscriptions_owner_delete
  ON public.web_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_business_owner(business_id));

CREATE POLICY web_push_subscriptions_owner_update
  ON public.web_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_business_owner(business_id))
  WITH CHECK (user_id = auth.uid() AND public.is_business_owner(business_id));

COMMIT;
