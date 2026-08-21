create table if not exists public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) unique,
  booking_buffer_minutes integer not null default 0,
  prep_time_minutes integer not null default 0,
  post_time_minutes integer not null default 0,
  max_advance_days integer not null default 30,
  min_notice_minutes integer not null default 120,
  auto_assign_professional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_business_settings_business on public.business_settings (business_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid references public.users(id),
  type text not null check (type in ('appointment','payment','system','reminder')),
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_business on public.notifications (business_id, created_at desc);
create index idx_notifications_user on public.notifications (user_id, read_at) where read_at is null;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  to_email text not null,
  to_name text,
  subject text not null,
  body_html text,
  body_text text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_email_outbox_business on public.email_outbox (business_id, created_at desc);
create index idx_email_outbox_status on public.email_outbox (status) where status = 'pending';
