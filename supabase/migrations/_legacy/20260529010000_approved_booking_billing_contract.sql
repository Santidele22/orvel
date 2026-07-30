-- Approved Orvel booking/billing database contract remediation.
-- Idempotent/additive migration: repairs legacy schema without dropping user data.
-- Public booking management tokens are NEVER stored raw. RPCs hash the supplied
-- token with SHA-256 and compare against bookings.manage_token_hash. The default
-- token expiry is booking ends_at + 1 hour so clients can manage the booking
-- until shortly after the appointment window.

create extension if not exists pgcrypto;
-- ---------- Tenant helpers / RLS ----------
create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
alter table public.business_members enable row level security;
create or replace function public.can_manage_business(p_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses b
    where b.id = p_business_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
  );
$$;
-- ---------- Business settings ----------
alter table public.businesses
  add column if not exists slug text,
  add column if not exists name text not null default 'Orvel Business',
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires',
  add column if not exists capacity integer not null default 1 check (capacity >= 1);
create unique index if not exists businesses_slug_unique_idx on public.businesses (slug) where slug is not null;
alter table public.business_settings
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires',
  add column if not exists slot_interval_minutes integer not null default 30 check (slot_interval_minutes > 0),
  add column if not exists buffer_minutes integer not null default 0 check (buffer_minutes >= 0),
  add column if not exists min_notice_minutes integer not null default 0 check (min_notice_minutes >= 0),
  add column if not exists max_advance_days integer not null default 60 check (max_advance_days >= 1),
  add column if not exists cancellation_window_minutes integer not null default 60 check (cancellation_window_minutes >= 0),
  add column if not exists auto_confirm boolean not null default true,
  add column if not exists capacity integer not null default 1 check (capacity >= 1),
  add column if not exists allow_client_reschedule boolean not null default true,
  add column if not exists allow_client_cancel boolean not null default true;
-- ---------- Services/categories ----------
create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);
alter table public.services
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists category_id uuid references public.service_categories(id) on delete set null;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'services' and column_name = 'active'
  ) then
    update public.services set is_active = active where is_active is distinct from active;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'services' and column_name = 'category'
  ) then
    insert into public.service_categories (business_id, name)
    select distinct business_id, nullif(trim(category), '')
    from public.services
    where nullif(trim(category), '') is not null
    on conflict (business_id, name) do nothing;

    update public.services s
    set category_id = sc.id
    from public.service_categories sc
    where sc.business_id = s.business_id
      and sc.name = nullif(trim(s.category), '')
      and s.category_id is null;
  end if;
end $$;
-- ---------- Booking schema/status/token history ----------
alter table public.bookings
  add column if not exists manage_token_hash text,
  add column if not exists manage_token_expires_at timestamptz,
  add column if not exists source text not null default 'client-self-service';
update public.bookings
set status = 'confirmed'
where status = 'booked';
update public.bookings
set manage_token_expires_at = ends_at + interval '1 hour'
where manage_token_hash is not null
  and manage_token_expires_at is null;
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_status_check'
  ) then
    alter table public.bookings drop constraint bookings_status_check;
  end if;

  alter table public.bookings
    alter column status set default 'confirmed';

  alter table public.bookings
    add constraint bookings_status_check
    check (status in ('confirmed', 'cancelled', 'completed', 'no_show'));
end $$;
create unique index if not exists bookings_manage_token_hash_idx
  on public.bookings (manage_token_hash)
  where manage_token_hash is not null;
create index if not exists bookings_active_overlap_idx
  on public.bookings (business_id, branch_id, starts_at, ends_at)
  where status = 'confirmed';
create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  performed_by uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- ---------- Billing canonical volume plans ----------
create table if not exists public.plans (
  code text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.plans
  add column if not exists name text not null default 'Plan',
  add column if not exists price numeric not null default 0,
  add column if not exists currency text default 'ARS',
  add column if not exists billing_frequency integer default 1,
  add column if not exists billing_frequency_type text default 'months',
  add column if not exists duration_days integer default 30,
  add column if not exists active boolean not null default true;
create table if not exists public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.plans(code),
  currency text not null default 'ARS',
  amount_cents integer not null check (amount_cents >= 0),
  interval text not null default 'month',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_code, currency, interval)
);
create table if not exists public.plan_entitlements (
  plan_code text primary key references public.plans(code),
  monthly_booking_limit integer not null,
  branch_base_limit integer not null default 1,
  core_booking_features boolean not null default true
);
alter table public.plan_entitlements
  add column if not exists max_locales integer not null default 1,
  add column if not exists max_rubros integer not null default 1,
  add column if not exists max_monthly_bookings integer,
  add column if not exists ai_credits_monthly integer not null default 0,
  add column if not exists monthly_booking_limit integer,
  add column if not exists branch_base_limit integer not null default 1,
  add column if not exists core_booking_features boolean not null default true;
insert into public.plans (code, name, price, currency, billing_frequency, billing_frequency_type, duration_days, active)
values
  ('FREE', 'Free', 0, 'ARS', 1, 'months', 30, true),
  ('SIMPLE', 'Simple', 9900, 'ARS', 1, 'months', 30, true),
  ('CRECE', 'Crece', 24900, 'ARS', 1, 'months', 30, true),
  ('ESCALA', 'Escala', 44900, 'ARS', 1, 'months', 30, true)
on conflict (code) do update set
  name = excluded.name,
  price = excluded.price,
  currency = excluded.currency,
  billing_frequency = excluded.billing_frequency,
  billing_frequency_type = excluded.billing_frequency_type,
  duration_days = excluded.duration_days,
  active = true;
insert into public.plan_prices (plan_code, currency, amount_cents, interval, active)
values
  ('FREE', 'ARS', 0, 'month', true),
  ('SIMPLE', 'ARS', 990000, 'month', true),
  ('CRECE', 'ARS', 2490000, 'month', true),
  ('ESCALA', 'ARS', 4490000, 'month', true)
on conflict (plan_code, currency, interval) do update set amount_cents = excluded.amount_cents, active = true;
insert into public.plan_entitlements (
  plan_code, max_locales, max_rubros, max_monthly_bookings, ai_credits_monthly,
  monthly_booking_limit, branch_base_limit, core_booking_features
)
values
  ('FREE', 1, 1, 30, 0, 30, 1, true),
  ('SIMPLE', 1, 1, 150, 0, 150, 1, true),
  ('CRECE', 1, 1, 500, 0, 500, 1, true),
  ('ESCALA', 1, 1, 1500, 0, 1500, 1, true)
on conflict (plan_code) do update set
  max_monthly_bookings = excluded.max_monthly_bookings,
  monthly_booking_limit = excluded.monthly_booking_limit,
  branch_base_limit = excluded.branch_base_limit,
  core_booking_features = true;
create table if not exists public.business_addons (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  addon_code text not null,
  quantity integer not null default 1 check (quantity >= 0),
  amount_cents integer not null default 2000000,
  currency text not null default 'ARS',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, addon_code)
);
comment on table public.business_addons is 'Supported add-on: EXTRA_BRANCH at ARS 20,000/month; each quantity adds +1 branch.';
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  tenant_id uuid,
  subscription_id uuid,
  provider text not null default 'mercado_pago',
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  tenant_id uuid,
  provider text not null default 'mercado_pago',
  provider_event_id text not null,
  provider_payment_id text,
  payload_hash text not null,
  signature_validated boolean not null default false,
  processed_at timestamptz,
  state text not null default 'reserved',
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
-- ---------- RLS policies ----------
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.branches enable row level security;
alter table public.business_settings enable row level security;
alter table public.customers enable row level security;
alter table public.services enable row level security;
alter table public.service_categories enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.blocked_times enable row level security;
alter table public.notification_email_outbox enable row level security;
alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.business_subscriptions enable row level security;
alter table public.business_addons enable row level security;
alter table public.subscription_events enable row level security;
alter table public.payment_webhook_events enable row level security;
do $$
begin
  create policy service_categories_business_scope on public.service_categories
    for all using (public.can_manage_business(business_id)) with check (public.can_manage_business(business_id));
exception when duplicate_object then null; end $$;
do $$
begin
  create policy bookings_business_scope on public.bookings
    for all using (public.can_manage_business(business_id)) with check (public.can_manage_business(business_id));
exception when duplicate_object then null; end $$;
do $$
begin
  create policy booking_events_business_scope on public.booking_events
    for all using (public.can_manage_business(business_id)) with check (public.can_manage_business(business_id));
exception when duplicate_object then null; end $$;
do $$
begin
  create policy public_plans_read on public.plans for select using (active = true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy public_plan_prices_read on public.plan_prices for select using (active = true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy public_plan_entitlements_read on public.plan_entitlements for select using (true);
exception when duplicate_object then null; end $$;
do $$
begin
  create policy business_addons_business_scope on public.business_addons
    for all using (public.can_manage_business(business_id)) with check (public.can_manage_business(business_id));
exception when duplicate_object then null; end $$;
-- ---------- Shared booking helpers ----------
create or replace function public._hash_manage_token(p_token text)
returns text
language sql
immutable
as $$ select encode(extensions.digest(p_token, 'sha256'), 'hex') $$;
create or replace function public._raise_rpc(p_code text)
returns void
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end;
$$;
create or replace function public._booking_duration(p_service_id uuid, p_fallback integer default 30)
returns integer
language sql
stable
as $$
  select coalesce((select duration_minutes from public.services where id = p_service_id), p_fallback, 30);
$$;
create or replace function public._assert_no_slot_conflict(
  p_business_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking_id uuid default null
)
returns void
language plpgsql
as $$
declare
  v_capacity integer;
  v_occupied integer;
begin
  select coalesce(bs.capacity, b.capacity, 1) into v_capacity
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  where b.id = p_business_id;

  select count(*) into v_occupied
  from public.bookings bk
  where bk.business_id = p_business_id
    and (p_branch_id is null or bk.branch_id = p_branch_id)
    and (p_exclude_booking_id is null or bk.id <> p_exclude_booking_id)
    and bk.status = 'confirmed'
    and tstzrange(bk.starts_at, bk.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');

  if coalesce(v_capacity, 1) <= v_occupied then
    perform public._raise_rpc('SLOT_CONFLICT');
  end if;

  if exists (
    select 1 from public.blocked_times bt
    where bt.business_id = p_business_id
      and (p_branch_id is null or bt.branch_id = p_branch_id)
      and tstzrange(bt.starts_at, bt.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    perform public._raise_rpc('BLOCKED_TIME_COLLISION');
  end if;
end;
$$;
create or replace function public._load_manageable_booking(p_token text, p_now timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if nullif(trim(p_token), '') is null then
    perform public._raise_rpc('INVALID_TOKEN');
  end if;

  select * into v_booking
  from public.bookings b
  where b.manage_token_hash = public._hash_manage_token(p_token)
  limit 1;

  if v_booking.id is null then
    perform public._raise_rpc('INVALID_TOKEN');
  end if;

  if v_booking.manage_token_expires_at is null or v_booking.manage_token_expires_at < p_now then
    perform public._raise_rpc('TOKEN_EXPIRED');
  end if;

  if v_booking.status <> 'confirmed' then
    perform public._raise_rpc('POLICY_WINDOW_CLOSED');
  end if;

  return v_booking;
end;
$$;
-- ---------- Public/admin RPCs ----------
drop function if exists public.resolve_business_by_slug(text);
create or replace function public.resolve_business_by_slug(business_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_row record;
begin
  select b.id, b.slug, b.name, b.timezone,
         coalesce(bs.auto_confirm, true) as auto_confirm,
         coalesce(bs.cancellation_window_minutes, 60) as cancellation_window_minutes,
         coalesce(bs.allow_client_reschedule, true) as allow_client_reschedule,
         coalesce(bs.allow_client_cancel, true) as allow_client_cancel,
         coalesce(bs.slot_interval_minutes, 30) as slot_interval_minutes,
         coalesce(bs.buffer_minutes, 0) as buffer_minutes,
         coalesce(bs.min_notice_minutes, 0) as min_notice_minutes,
         coalesce(bs.working_hours, '{}'::jsonb) as working_hours
  into v_row
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  where b.slug = business_slug
  limit 1;

  if v_row.id is null then
    perform public._raise_rpc('BUSINESS_NOT_FOUND');
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'timezone', v_row.timezone,
    'booking_policy', jsonb_build_object(
      'autoConfirm', v_row.auto_confirm,
      'cancellationWindowMinutes', v_row.cancellation_window_minutes,
      'allowClientProfessionalSelection', false,
      'allowClientReschedule', v_row.allow_client_reschedule,
      'allowClientCancel', v_row.allow_client_cancel
    ),
    'settings', jsonb_build_object(
      'slotIntervalMinutes', v_row.slot_interval_minutes,
      'bufferMinutes', v_row.buffer_minutes,
      'minNoticeMinutes', v_row.min_notice_minutes,
      'workingHours', v_row.working_hours
    )
  );
end;
$$;
create or replace function public.create_public_booking(
  business_slug text,
  service_id text,
  starts_at_iso text,
  client jsonb,
  notes text default null,
  professional_id text default null,
  branch_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_service_id uuid;
  v_branch_id uuid;
  v_customer_id uuid;
  v_booking_id uuid;
  v_duration integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_token text := encode(gen_random_bytes(32), 'base64url');
begin
  if professional_id is not null and nullif(trim(professional_id), '') is not null then
    perform public._raise_rpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN');
  end if;

  if nullif(trim(business_slug), '') is null or nullif(trim(service_id), '') is null or client is null then
    perform public._raise_rpc('BOOKING_VALIDATION_ERROR');
  end if;

  select id into v_business_id from public.businesses where slug = business_slug limit 1;
  if v_business_id is null then perform public._raise_rpc('BUSINESS_NOT_FOUND'); end if;

  v_service_id := service_id::uuid;
  v_branch_id := nullif(branch_id, '')::uuid;
  v_starts_at := starts_at_iso::timestamptz;
  v_duration := public._booking_duration(v_service_id, 30);
  v_ends_at := v_starts_at + make_interval(mins => v_duration);

  if v_starts_at is null or v_ends_at <= v_starts_at or nullif(trim(client->>'fullName'), '') is null then
    perform public._raise_rpc('BOOKING_VALIDATION_ERROR');
  end if;

  perform public._assert_no_slot_conflict(v_business_id, v_branch_id, v_starts_at, v_ends_at);

  insert into public.customers (business_id, full_name, email, phone)
  values (v_business_id, client->>'fullName', client->>'email', client->>'phone')
  returning id into v_customer_id;

  insert into public.bookings (
    business_id, branch_id, service_id, customer_id, starts_at, ends_at, status, notes,
    manage_token_hash, manage_token_expires_at, source
  ) values (
    v_business_id, v_branch_id, v_service_id, v_customer_id, v_starts_at, v_ends_at, 'confirmed', notes,
    public._hash_manage_token(v_token), v_ends_at + interval '1 hour', 'client-self-service'
  ) returning id into v_booking_id;

  insert into public.booking_events (booking_id, business_id, event_type, metadata)
  values (v_booking_id, v_business_id, 'created', jsonb_build_object('source', 'client-self-service'));

  return jsonb_build_object('booking_id', v_booking_id, 'status', 'confirmed', 'manage_token', v_token, 'source', 'client-self-service');
exception
  when invalid_text_representation or datetime_field_overflow then
    perform public._raise_rpc('BOOKING_VALIDATION_ERROR');
end;
$$;
create or replace function public.manage_booking_by_token(token text, now_iso text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_now timestamptz := now_iso::timestamptz;
  v_window integer;
begin
  v_booking := public._load_manageable_booking(token, v_now);
  select coalesce(cancellation_window_minutes, 60) into v_window from public.business_settings where business_id = v_booking.business_id;
  return jsonb_build_object(
    'booking_id', v_booking.id,
    'business_id', v_booking.business_id,
    'service_id', v_booking.service_id,
    'starts_at_iso', v_booking.starts_at,
    'can_cancel_or_reschedule', v_booking.starts_at - make_interval(mins => coalesce(v_window, 60)) > v_now
  );
end;
$$;
create or replace function public.cancel_booking_by_token(token text, now_iso text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_now timestamptz := now_iso::timestamptz;
  v_window integer;
  v_allowed boolean;
begin
  v_booking := public._load_manageable_booking(token, v_now);
  select coalesce(cancellation_window_minutes, 60), coalesce(allow_client_cancel, true)
  into v_window, v_allowed
  from public.business_settings where business_id = v_booking.business_id;

  if coalesce(v_allowed, true) is not true or v_booking.starts_at - make_interval(mins => coalesce(v_window, 60)) <= v_now then
    perform public._raise_rpc('POLICY_WINDOW_CLOSED');
  end if;

  update public.bookings set status = 'cancelled', updated_at = now() where id = v_booking.id;
  insert into public.booking_events (booking_id, business_id, event_type, metadata)
  values (v_booking.id, v_booking.business_id, 'cancelled', jsonb_build_object('source', 'client-token'));
  return jsonb_build_object('booking_id', v_booking.id, 'status', 'cancelled');
end;
$$;
create or replace function public.reschedule_booking_by_token(token text, now_iso text, starts_at_iso text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_now timestamptz := now_iso::timestamptz;
  v_new_start timestamptz := starts_at_iso::timestamptz;
  v_new_end timestamptz;
  v_window integer;
  v_allowed boolean;
begin
  v_booking := public._load_manageable_booking(token, v_now);
  select coalesce(cancellation_window_minutes, 60), coalesce(allow_client_reschedule, true)
  into v_window, v_allowed
  from public.business_settings where business_id = v_booking.business_id;

  if coalesce(v_allowed, true) is not true or v_booking.starts_at - make_interval(mins => coalesce(v_window, 60)) <= v_now then
    perform public._raise_rpc('POLICY_WINDOW_CLOSED');
  end if;

  v_new_end := v_new_start + (v_booking.ends_at - v_booking.starts_at);
  perform public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_new_start, v_new_end, v_booking.id);

  update public.bookings set starts_at = v_new_start, ends_at = v_new_end, updated_at = now(), manage_token_expires_at = v_new_end + interval '1 hour' where id = v_booking.id;
  insert into public.booking_events (booking_id, business_id, event_type, metadata)
  values (v_booking.id, v_booking.business_id, 'rescheduled', jsonb_build_object('source', 'client-token', 'previous_starts_at', v_booking.starts_at, 'new_starts_at', v_new_start));
  return jsonb_build_object('booking_id', v_booking.id, 'starts_at_iso', v_new_start);
end;
$$;
create or replace function public.create_admin_manual_booking(
  business_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  client_id text default null,
  walk_in_name text default null,
  professional_id text default null,
  performed_by uuid default null,
  notes text default null,
  branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_id uuid := service_id::uuid;
  v_customer_id uuid := nullif(client_id, '')::uuid;
  v_starts_at timestamptz := starts_at_iso::timestamptz;
  v_ends_at timestamptz;
  v_booking_id uuid;
begin
  if not public.can_manage_business(business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  if v_starts_at is null or duration_minutes <= 0 then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  v_ends_at := v_starts_at + make_interval(mins => duration_minutes);
  perform public._assert_no_slot_conflict(business_id, branch_id, v_starts_at, v_ends_at);

  if v_customer_id is null and nullif(trim(walk_in_name), '') is not null then
    insert into public.customers (business_id, full_name) values (business_id, walk_in_name) returning id into v_customer_id;
  end if;

  insert into public.bookings (business_id, branch_id, service_id, customer_id, starts_at, ends_at, status, notes, source)
  values (business_id, branch_id, v_service_id, v_customer_id, v_starts_at, v_ends_at, 'confirmed', notes, 'admin-manual')
  returning id into v_booking_id;

  insert into public.booking_events (booking_id, business_id, event_type, performed_by, metadata)
  values (v_booking_id, business_id, 'created', coalesce(performed_by, auth.uid()), jsonb_build_object('source', 'admin-manual'));

  return jsonb_build_object('booking_id', v_booking_id, 'type', 'manual-admin-appointment', 'status', 'confirmed', 'source', 'admin-manual');
end;
$$;
create or replace function public.update_admin_booking(booking_id uuid, performed_by uuid default null, notes text default null, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_business_id uuid;
begin
  select business_id into v_business_id from public.bookings where id = booking_id;
  if v_business_id is null then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  if not public.can_manage_business(v_business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  update public.bookings set notes = coalesce(notes, public.bookings.notes), updated_at = now() where id = booking_id;
  insert into public.booking_events (booking_id, business_id, event_type, performed_by, metadata)
  values (booking_id, v_business_id, 'updated', coalesce(performed_by, auth.uid()), jsonb_build_object('reason', reason));
  return jsonb_build_object('booking_id', booking_id, 'updated_at', now());
end;
$$;
create or replace function public.cancel_admin_booking(booking_id uuid, performed_by uuid default null, notes text default null, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_business_id uuid;
begin
  select business_id into v_business_id from public.bookings where id = booking_id;
  if v_business_id is null then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  if not public.can_manage_business(v_business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  update public.bookings set status = 'cancelled', notes = coalesce(notes, public.bookings.notes), updated_at = now() where id = booking_id and status = 'confirmed';
  insert into public.booking_events (booking_id, business_id, event_type, performed_by, metadata)
  values (booking_id, v_business_id, 'cancelled', coalesce(performed_by, auth.uid()), jsonb_build_object('reason', reason, 'source', 'admin'));
  return jsonb_build_object('booking_id', booking_id, 'status', 'cancelled');
end;
$$;
create or replace function public.reschedule_admin_booking(booking_id uuid, starts_at_iso text, performed_by uuid default null, notes text default null, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_new_start timestamptz := starts_at_iso::timestamptz;
  v_new_end timestamptz;
begin
  select * into v_booking from public.bookings where id = booking_id;
  if v_booking.id is null then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  if not public.can_manage_business(v_booking.business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  if v_booking.status <> 'confirmed' then perform public._raise_rpc('POLICY_WINDOW_CLOSED'); end if;
  v_new_end := v_new_start + (v_booking.ends_at - v_booking.starts_at);
  perform public._assert_no_slot_conflict(v_booking.business_id, v_booking.branch_id, v_new_start, v_new_end, booking_id);
  update public.bookings set starts_at = v_new_start, ends_at = v_new_end, notes = coalesce(notes, public.bookings.notes), updated_at = now() where id = booking_id;
  insert into public.booking_events (booking_id, business_id, event_type, performed_by, metadata)
  values (booking_id, v_booking.business_id, 'rescheduled', coalesce(performed_by, auth.uid()), jsonb_build_object('reason', reason, 'source', 'admin'));
  return jsonb_build_object('booking_id', booking_id, 'starts_at_iso', v_new_start);
end;
$$;
create or replace function public.update_booking_status(booking_id uuid, status text, performed_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_business_id uuid;
begin
  if status not in ('confirmed', 'cancelled', 'completed', 'no_show') then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  select business_id into v_business_id from public.bookings where id = booking_id;
  if v_business_id is null then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  if not public.can_manage_business(v_business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  update public.bookings set status = update_booking_status.status, updated_at = now() where id = booking_id;
  insert into public.booking_events (booking_id, business_id, event_type, performed_by, metadata)
  values (booking_id, v_business_id, 'status_changed', coalesce(performed_by, auth.uid()), jsonb_build_object('status', status));
  return jsonb_build_object('booking_id', booking_id, 'status', status);
end;
$$;
create or replace function public.create_admin_blocked_time(
  business_id uuid,
  starts_at_iso text,
  ends_at_iso text,
  reason text,
  performed_by uuid default null,
  branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts_at timestamptz := starts_at_iso::timestamptz;
  v_ends_at timestamptz := ends_at_iso::timestamptz;
  v_block_id uuid;
begin
  if not public.can_manage_business(business_id) then perform public._raise_rpc('UNAUTHORIZED'); end if;
  if v_ends_at <= v_starts_at then perform public._raise_rpc('BOOKING_VALIDATION_ERROR'); end if;
  if exists (
    select 1 from public.bookings b
    where b.business_id = create_admin_blocked_time.business_id
      and (branch_id is null or b.branch_id = branch_id)
      and b.status = 'confirmed'
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then
    perform public._raise_rpc('BLOCKED_TIME_COLLISION');
  end if;
  insert into public.blocked_times (business_id, branch_id, starts_at, ends_at, reason)
  values (business_id, branch_id, v_starts_at, v_ends_at, reason)
  returning id into v_block_id;
  return jsonb_build_object('blocked_time_id', v_block_id, 'block_id', v_block_id, 'type', 'blocked-time');
end;
$$;
grant execute on function public.create_public_booking(text, text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.resolve_business_by_slug(text) to anon, authenticated;
grant execute on function public.manage_booking_by_token(text, text) to anon, authenticated;
grant execute on function public.cancel_booking_by_token(text, text) to anon, authenticated;
grant execute on function public.reschedule_booking_by_token(text, text, text) to anon, authenticated;
grant execute on function public.create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.update_admin_booking(uuid, uuid, text, text) to authenticated;
grant execute on function public.cancel_admin_booking(uuid, uuid, text, text) to authenticated;
grant execute on function public.reschedule_admin_booking(uuid, text, uuid, text, text) to authenticated;
grant execute on function public.update_booking_status(uuid, text, uuid) to authenticated;
grant execute on function public.create_admin_blocked_time(uuid, text, text, text, uuid, uuid) to authenticated;
