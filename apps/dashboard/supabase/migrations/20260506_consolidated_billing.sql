-- Consolidated billing/payment schema contracts.

create table if not exists public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tenant_id uuid not null,
  provider text not null default 'mercado_pago',
  provider_subscription_id text not null,
  plan_code text not null,
  subscription_status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

alter table public.business_subscriptions enable row level security;

create policy business_subscriptions_tenant_scope
  on public.business_subscriptions
  for all
  using (tenant_id = auth.uid() or business_id = auth.uid())
  with check (tenant_id = auth.uid() or business_id = auth.uid());

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tenant_id uuid not null,
  subscription_id uuid not null references public.business_subscriptions(id),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.subscription_events enable row level security;

create policy subscription_events_tenant_scope
  on public.subscription_events
  for all
  using (tenant_id = auth.uid() or business_id = auth.uid())
  with check (tenant_id = auth.uid() or business_id = auth.uid());

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  tenant_id uuid,
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text,
  payload_hash text not null,
  signature_validated boolean not null default false,
  processed_at timestamptz,
  state text not null default 'reserved',
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.payment_webhook_events enable row level security;

create policy payment_webhook_events_tenant_scope
  on public.payment_webhook_events
  for all
  using (tenant_id = auth.uid() or business_id = auth.uid())
  with check (tenant_id = auth.uid() or business_id = auth.uid());

grant select, insert, update, delete on table public.payment_webhook_events to service_role;

create table if not exists public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  tenant_id uuid not null,
  provider text not null,
  scanned integer not null default 0,
  drift_count integer not null default 0,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.billing_reconciliation_runs enable row level security;

create policy billing_reconciliation_runs_tenant_scope
  on public.billing_reconciliation_runs
  for all
  using (tenant_id = auth.uid() or business_id = auth.uid())
  with check (tenant_id = auth.uid() or business_id = auth.uid());

create table if not exists public.payment_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  provider text not null,
  idempotency_key text not null,
  external_reference text not null,
  checkout_url text not null,
  status text not null,
  amount_cents integer not null,
  currency text not null default 'ARS',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, idempotency_key),
  unique (provider, external_reference)
);

alter table public.payment_checkout_intents enable row level security;

create table if not exists public.payment_status_reconciliation (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_payment_id text not null,
  external_reference text not null,
  reconciled_status text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

alter table public.payment_status_reconciliation enable row level security;

create table if not exists public.entitlement_update_ledger (
  id uuid primary key default gen_random_uuid(),
  entitlement_idempotency_key text not null,
  business_id uuid not null,
  plan_code text not null,
  applied_at timestamptz not null default now(),
  unique (entitlement_idempotency_key)
);

alter table public.entitlement_update_ledger enable row level security;

create or replace function public.reserve_payment_webhook_event()
returns void
language sql
security definer
as $$ select null::void $$;

create or replace function public.mark_payment_webhook_event_state()
returns void
language sql
security definer
as $$ select null::void $$;

create or replace function public.apply_subscription_event_transition()
returns void
language sql
security definer
as $$ select null::void $$;

create or replace function public.reconcile_mercadopago_subscriptions_dry_run()
returns jsonb
language sql
security definer
as $$ select jsonb_build_object('scanned', 0, 'drift_count', 0, 'actions', '[]'::jsonb) $$;
