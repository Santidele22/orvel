-- Branch-scoped appointment support.
-- Non-destructive: adds nullable columns/tables, backfills safe defaults, and
-- creates branch-aware indexes/RPCs without dropping existing data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  rubro text,
  address text,
  timezone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS branches_business_slug_unique_idx
  ON public.branches(business_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS branches_business_active_idx
  ON public.branches(business_id, is_active, name);

DROP POLICY IF EXISTS "Owners manage branches" ON public.branches;
DROP POLICY IF EXISTS "Public view active branches" ON public.branches;

CREATE POLICY "Owners manage branches" ON public.branches
  FOR ALL
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Public view active branches" ON public.branches
  FOR SELECT
  USING (is_active = true);

INSERT INTO public.branches (business_id, name, slug, timezone, is_active)
SELECT b.id, COALESCE(NULLIF(b.name, ''), 'Sucursal principal'), 'principal', b.timezone, true
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches br WHERE br.business_id = b.id
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professional_id text;

UPDATE public.bookings bk
SET branch_id = br.id
FROM public.branches br
WHERE bk.branch_id IS NULL
  AND br.business_id = bk.business_id
  AND br.slug = 'principal';

CREATE INDEX IF NOT EXISTS bookings_branch_starts_at_idx
  ON public.bookings(branch_id, starts_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_business_branch_starts_at_idx
  ON public.bookings(business_id, branch_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS bookings_active_branch_overlap_idx
  ON public.bookings(branch_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'rejected');

CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid,
  branch_id uuid,
  service_id text,
  starts_at_iso text,
  duration_minutes integer,
  client_id text DEFAULT NULL,
  walk_in_name text DEFAULT NULL,
  professional_id text DEFAULT NULL,
  performed_by text DEFAULT NULL,
  notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid := business_id;
  v_requested_branch_id uuid := branch_id;
  v_requested_service_id text := service_id;
  v_requested_client_id text := client_id;
  v_requested_walk_in_name text := walk_in_name;
  v_requested_professional_id text := professional_id;
  v_requested_performed_by text := performed_by;
  v_requested_notes text := notes;
  v_branch_id uuid;
  v_service_id uuid;
  v_customer_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration_minutes integer;
  v_booking_id uuid;
BEGIN
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_REQUIRED';
  END IF;

  IF v_requested_branch_id IS NULL THEN
    RAISE EXCEPTION 'BRANCH_REQUIRED';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.is_business_owner(v_business_id) THEN
    RAISE EXCEPTION 'BRANCH_FORBIDDEN';
  END IF;

  SELECT br.id INTO v_branch_id
  FROM public.branches br
  WHERE br.id = v_requested_branch_id
    AND br.business_id = v_business_id
    AND br.is_active = true;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_BRANCH';
  END IF;

  BEGIN
    v_service_id := v_requested_service_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_SERVICE';
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = v_service_id
      AND s.business_id = v_business_id
      AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'INVALID_SERVICE';
  END IF;

  BEGIN
    v_starts_at := starts_at_iso::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_STARTS_AT';
  END;

  v_duration_minutes := COALESCE(NULLIF(duration_minutes, 0), (
    SELECT s.duration_minutes FROM public.services s WHERE s.id = v_service_id
  ));

  IF v_duration_minutes IS NULL OR v_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  v_ends_at := v_starts_at + (v_duration_minutes || ' minutes')::interval;

  IF v_requested_client_id IS NOT NULL AND btrim(v_requested_client_id) <> '' THEN
    BEGIN
      v_customer_id := v_requested_client_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CLIENT';
    END;

    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = v_customer_id
        AND c.business_id = v_business_id
    ) THEN
      RAISE EXCEPTION 'INVALID_CLIENT';
    END IF;
  ELSIF v_requested_walk_in_name IS NOT NULL AND btrim(v_requested_walk_in_name) <> '' THEN
    INSERT INTO public.customers (business_id, full_name)
    VALUES (v_business_id, btrim(v_requested_walk_in_name))
    RETURNING id INTO v_customer_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings bk
    WHERE bk.business_id = v_business_id
      AND bk.branch_id = v_branch_id
      AND bk.status NOT IN ('cancelled', 'rejected')
      AND bk.starts_at < v_ends_at
      AND bk.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'SLOT_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.blocked_times bt
    WHERE bt.business_id = v_business_id
      AND bt.starts_at < v_ends_at
      AND bt.ends_at > v_starts_at
  ) THEN
    RAISE EXCEPTION 'BLOCKED_TIME_COLLISION';
  END IF;

  INSERT INTO public.bookings (
    business_id,
    branch_id,
    customer_id,
    service_id,
    starts_at,
    ends_at,
    status,
    professional_id,
    notes
  ) VALUES (
    v_business_id,
    v_branch_id,
    v_customer_id,
    v_service_id,
    v_starts_at,
    v_ends_at,
    'booked',
    NULLIF(btrim(v_requested_professional_id), ''),
    NULLIF(btrim(v_requested_notes), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'branch_id', v_branch_id,
    'starts_at_iso', v_starts_at::text,
    'ends_at_iso', v_ends_at::text,
    'performed_by', NULLIF(btrim(v_requested_performed_by), '')
  );
END;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
