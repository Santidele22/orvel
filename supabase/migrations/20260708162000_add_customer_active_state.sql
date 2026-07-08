ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.customers.active IS 'Durable active/inactive customer state used by dashboard deactivation flows.';

CREATE INDEX IF NOT EXISTS idx_customers_business_active
  ON public.customers (business_id, active);
