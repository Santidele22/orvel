-- ============================================================================
-- Schema snapshot: orvel-qa-dev (rloovjtdaqvcgzlbppfr)
-- Generated: 2026-07-30
-- Method: pg_dump is unavailable (no CLI); schema reconstructed from
--   information_schema.columns, pg_indexes, and
--   information_schema.table_constraints via MCP execute_sql.
-- Note: This is NOT a pg_dump output. It's a faithful DDL reconstruction
--   from live metadata queries. Column order, types, defaults, and
--   constraints are exact; triggers, sequences, and extensions are
--   not captured.
-- Important: The remote has 6 applied migrations (20260729*) that do NOT
--   match the local migration files (202604*-202606*). The schema below
--   reflects the ACTUAL remote state, not the local file state.
-- ============================================================================

-- ============================================================================
-- Table: businesses
-- ============================================================================
CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    slug text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT businesses_pkey PRIMARY KEY (id),
    CONSTRAINT businesses_slug_key UNIQUE (slug)
);

CREATE INDEX idx_businesses_slug ON public.businesses USING btree (slug) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: professionals
-- ============================================================================
CREATE TABLE public.professionals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT professionals_pkey PRIMARY KEY (id),
    CONSTRAINT professionals_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

CREATE INDEX idx_professionals_business ON public.professionals USING btree (business_id) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: service_categories
-- ============================================================================
CREATE TABLE public.service_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT service_categories_pkey PRIMARY KEY (id),
    CONSTRAINT service_categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

CREATE INDEX idx_categories_business ON public.service_categories USING btree (business_id) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: services
-- ============================================================================
CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    duration_minutes integer NOT NULL,
    price numeric NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT services_pkey PRIMARY KEY (id),
    CONSTRAINT services_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
    CONSTRAINT services_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.service_categories(id)
);

CREATE INDEX idx_services_business ON public.services USING btree (business_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_services_category ON public.services USING btree (category_id) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: professional_services (N:M join)
-- ============================================================================
CREATE TABLE public.professional_services (
    professional_id uuid NOT NULL,
    service_id uuid NOT NULL,
    custom_price numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT professional_services_pkey PRIMARY KEY (professional_id, service_id),
    CONSTRAINT professional_services_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
    CONSTRAINT professional_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id)
);

-- ============================================================================
-- Table: professional_hours
-- ============================================================================
CREATE TABLE public.professional_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT professional_hours_pkey PRIMARY KEY (id),
    CONSTRAINT professional_hours_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
    CONSTRAINT professional_hours_professional_id_day_of_week_key UNIQUE (professional_id, day_of_week)
);

CREATE INDEX idx_prof_hours_professional ON public.professional_hours USING btree (professional_id);

-- ============================================================================
-- Table: users
-- ============================================================================
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    professional_id uuid,
    name text NOT NULL,
    email_verified_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
    CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
    CONSTRAINT users_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
    CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);

CREATE INDEX idx_users_business ON public.users USING btree (business_id) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: clients
-- ============================================================================
CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

CREATE INDEX idx_clients_business ON public.clients USING btree (business_id) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: appointments
-- ============================================================================
CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    client_id uuid NOT NULL,
    service_id uuid NOT NULL,
    professional_id uuid,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status text NOT NULL,
    source text NOT NULL,
    price_final numeric,
    notes text,
    canceled_at timestamp with time zone,
    cancel_reason text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT appointments_pkey PRIMARY KEY (id),
    CONSTRAINT appointments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
    CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT appointments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.professionals(id),
    CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id)
);

CREATE INDEX idx_appointments_business ON public.appointments USING btree (business_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_appointments_client ON public.appointments USING btree (client_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_appointments_date ON public.appointments USING btree (business_id, date) WHERE (deleted_at IS NULL);
CREATE INDEX idx_appointments_professional ON public.appointments USING btree (professional_id, date) WHERE (deleted_at IS NULL);

-- ============================================================================
-- Table: business_settings
-- ============================================================================
CREATE TABLE public.business_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    booking_buffer_minutes integer DEFAULT 0 NOT NULL,
    prep_time_minutes integer DEFAULT 0 NOT NULL,
    post_time_minutes integer DEFAULT 0 NOT NULL,
    max_advance_days integer DEFAULT 30 NOT NULL,
    min_notice_minutes integer DEFAULT 120 NOT NULL,
    auto_assign_professional boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_settings_pkey PRIMARY KEY (id),
    CONSTRAINT business_settings_business_id_key UNIQUE (business_id),
    CONSTRAINT business_settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

CREATE INDEX idx_business_settings_business ON public.business_settings USING btree (business_id);

-- ============================================================================
-- Table: notifications
-- ============================================================================
CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    user_id uuid,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id),
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE INDEX idx_notifications_business ON public.notifications USING btree (business_id, created_at DESC);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, read_at) WHERE (read_at IS NULL);

-- ============================================================================
-- Table: email_outbox
-- ============================================================================
CREATE TABLE public.email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    to_email text NOT NULL,
    to_name text,
    subject text NOT NULL,
    body_html text,
    body_text text,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_outbox_pkey PRIMARY KEY (id),
    CONSTRAINT email_outbox_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id)
);

CREATE INDEX idx_email_outbox_business ON public.email_outbox USING btree (business_id, created_at DESC);
CREATE INDEX idx_email_outbox_status ON public.email_outbox USING btree (status) WHERE (status = 'pending'::text);

-- ============================================================================
-- Schema summary (public schema only)
-- ============================================================================
-- Total tables: 12
-- Total indexes: 20 (excl. PK/unique constraint-backed indexes)
-- Applied migrations: 6 (20260729* — see supabase_migrations.schema_migrations)
-- RLS enabled: FALSE on ALL tables (security advisory active)
