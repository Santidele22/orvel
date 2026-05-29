-- Billing pricing and entitlement contracts used by the landing, onboarding,
-- subscription, and server-side entitlement guards.

create table if not exists public.plans (
  code text primary key,
  name text not null,
  price integer not null,
  currency text not null default 'ARS',
  billing_frequency integer not null,
  billing_frequency_type text not null,
  duration_days integer not null,
  active boolean not null default true
);

insert into public.plans (code, name, price, currency, billing_frequency, billing_frequency_type, duration_days, active)
values
  ('starter_monthly', 'Plan starter Mensual', 12, 'ARS', 1, 'month', 30, true),
  ('starter_quarterly', 'Plan starter Trimestral', 34, 'ARS', 3, 'quarter', 90, true),
  ('starter_annual', 'Plan starter Anual', 122, 'ARS', 12, 'year', 365, true),
  ('growth_monthly', 'Plan growth Mensual', 22, 'ARS', 1, 'month', 30, true),
  ('growth_quarterly', 'Plan growth Trimestral', 63, 'ARS', 3, 'quarter', 90, true),
  ('growth_annual', 'Plan growth Anual', 224, 'ARS', 12, 'year', 365, true),
  ('pro_monthly', 'Plan pro Mensual', 39, 'ARS', 1, 'month', 30, true),
  ('pro_quarterly', 'Plan pro Trimestral', 111, 'ARS', 3, 'quarter', 90, true),
  ('pro_annual', 'Plan pro Anual', 398, 'ARS', 12, 'year', 365, true)
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  currency = excluded.currency,
  billing_frequency = excluded.billing_frequency,
  billing_frequency_type = excluded.billing_frequency_type,
  duration_days = excluded.duration_days,
  active = excluded.active;

create table if not exists public.plan_entitlements (
  plan_code text primary key,
  max_locales integer not null,
  max_rubros integer not null,
  max_monthly_bookings integer,
  ai_credits_monthly integer not null default 0
);

insert into public.plan_entitlements (plan_code, max_locales, max_rubros, max_monthly_bookings, ai_credits_monthly)
values
  ('FREE', 1, 1, 15, 0),
  ('BASIC', 1, 1, null, 100),
  ('MEDIUM', 3, 3, null, 500),
  ('PRO', 10, 10, null, 2000),
  ('STARTER', 1, 2, null, 100),
  ('GROWTH', 3, 3, null, 500)
on conflict (plan_code) do update set
  max_locales = excluded.max_locales,
  max_rubros = excluded.max_rubros,
  max_monthly_bookings = excluded.max_monthly_bookings,
  ai_credits_monthly = excluded.ai_credits_monthly;

create table if not exists public.business_subscriptions (
  business_id text not null,
  tenant_id text not null,
  plan_code text not null references public.plan_entitlements(plan_code),
  subscription_status text not null,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  primary key (business_id, tenant_id)
);

do $$
begin
  create type public.business_entitlements_snapshot as (
    business_id text,
    tenant_id text,
    plan_code text,
    subscription_status text,
    max_locales integer,
    max_rubros integer,
    max_monthly_bookings integer,
    ai_credits_monthly integer
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.get_business_entitlements_snapshot(
  business_id text,
  tenant_id text
)
returns setof public.business_entitlements_snapshot
language sql
security definer
stable
as $$
  select
    bs.business_id,
    bs.tenant_id,
    bs.plan_code,
    bs.subscription_status,
    pe.max_locales,
    pe.max_rubros,
    pe.max_monthly_bookings,
    pe.ai_credits_monthly
  from public.business_subscriptions bs
  join public.plan_entitlements pe on pe.plan_code = bs.plan_code
  where bs.business_id = $1
    and bs.tenant_id = $2
    and bs.subscription_status in ('active', 'trialing')
  limit 1;
$$;

create or replace function public.assert_business_entitlement(
  business_id text,
  metric text,
  requested_units integer
)
returns table (
  allowed boolean,
  reason text,
  remaining integer
)
language plpgsql
security definer
stable
as $$
declare
  v_snapshot record;
  v_limit integer;
begin
  select * into v_snapshot
  from public.get_business_entitlements_snapshot(business_id, '')
  limit 1;

  if v_snapshot is null then
    return query select false, 'SUBSCRIPTION_NOT_ACTIVE'::text, 0;
    return;
  end if;

  if metric = 'maxLocales' then
    v_limit := v_snapshot.max_locales;
  elsif metric = 'maxRubros' then
    v_limit := v_snapshot.max_rubros;
  else
    return query select false, 'PLAN_MATRIX_MISSING'::text, 0;
    return;
  end if;

  if requested_units <= v_limit then
    return query select true, 'OK'::text, greatest(v_limit - requested_units, 0);
  else
    return query select false, 'ENTITLEMENT_LIMIT_EXCEEDED'::text, 0;
  end if;
end;
$$;
